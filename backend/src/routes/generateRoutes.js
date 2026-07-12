const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');
const { aiLimiter, apiLimiter } = require('../middleware/rateLimiters');
const { MODELS, callClaude, respondError, UserFacingError } = require('../services/claude');
const {
    RESUME_PARSE_SCHEMA, buildResumeParsePrompt,
    JD_PARSE_SCHEMA, buildJdParsePrompt,
    KEYWORDS_SCHEMA, buildKeywordsPrompt,
    ELIGIBILITY_SCHEMA, buildEligibilityPrompt,
    EVIDENCE_SCHEMA, buildEvidenceMiningPrompt,
    MATCH_SCHEMA, buildMatchPrompt,
    EXTRACT_JOB_SCHEMA, buildExtractJobPrompt,
    TECH_EXTRACTION_SCHEMA, buildTechExtractionPrompt,
    buildTailorPrompt, buildTailorFixPrompt, buildCoverLetterPrompt,
} = require('../services/prompts');
const { dedupeKeywords, matchKeywords, normalize, detectTechTerms } = require('../utils/keywordMatcher');
const { recommendationFor } = require('../utils/matchBands');
const {
    NoH1BSponsorshipPhrases,
    NoOPTCPTSupportPhrases,
    PermanentAuthOnlyPhrases,
    noH1BSponsorshipRegexes,
    noOPTCPTRegexes,
    permanentAuthOnlyRegexes,
    sponsorshipFriendlyPhrases,
    sponsorshipFriendlyRegexes
} = require('../utils/visaSponsorshipFilters');

// JSONB columns come back from `pg` already parsed. Guard against double-parsing:
// return the value as-is if it's already an array/object, else parse the string.
function asArray(val) {
    if (val == null) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return []; }
}

function noH1BSponsorshipCheck(rawText) {
    const text = rawText.toLowerCase();
    return (
        NoH1BSponsorshipPhrases.some(p => text.includes(p.toLowerCase())) ||
        noH1BSponsorshipRegexes.some(r => r.test(rawText))
    );
}

function blocksOPTCPT(rawText) {
    const text = rawText.toLowerCase();
    return (
        NoOPTCPTSupportPhrases.some(p => text.includes(p.toLowerCase())) ||
        noOPTCPTRegexes.some(r => r.test(rawText))
    );
}

function requiresPermanentAuth(rawText) {
    const text = rawText.toLowerCase();
    return (
        PermanentAuthOnlyPhrases.some(p => text.includes(p.toLowerCase())) ||
        permanentAuthOnlyRegexes.some(r => r.test(rawText))
    );
}

function supportsSponsorship(rawText) {
    const text = rawText.toLowerCase();
    return (
        sponsorshipFriendlyPhrases.some(p => text.includes(p.toLowerCase())) ||
        sponsorshipFriendlyRegexes.some(r => r.test(rawText))
    );
}

// Returns { eligible: true } or { eligible: false, message }
function visaGate(work_auth, jdRawText) {
    if (work_auth === 'permanent') return { eligible: true };
    if (supportsSponsorship(jdRawText)) return { eligible: true };
    if (work_auth === 'needs_h1b') {
        if (blocksOPTCPT(jdRawText) || requiresPermanentAuth(jdRawText) || noH1BSponsorshipCheck(jdRawText)) {
            return {
                eligible: false,
                message: 'This job requires authorization to work without sponsorship. Based on your work authorization status, you may not be eligible.'
            };
        }
    } else if (work_auth === 'opt_cpt') {
        if (blocksOPTCPT(jdRawText) || requiresPermanentAuth(jdRawText)) {
            return {
                eligible: false,
                message: 'This job does not accept OPT/CPT applications. Consider saving the job and applying when you have permanent authorization.'
            };
        }
    }
    return { eligible: true };
}

// ── Deterministic pre-gate (ZERO Claude calls) ──────────────────────────────
// Catches obvious ineligibility — wrong work auth, big experience shortfall,
// fundamentally different tech stack — with pure regex/arithmetic, so clearly
// unsuitable jobs never spend a single AI credit. Conservative by design: it
// only hard-fails clear misses; nuanced cases pass through to the (cheap)
// Claude eligibility stage, which remains the final authority.
const YEARS_HARD_GAP = 2;   // fail only when candidate is ≥2 years short
const TECH_FLOOR = 20;      // fail only when <20% of JD tech appears in resume
const MIN_JD_TECH_TERMS = 5; // need ≥5 detected terms before the floor applies

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Full date ("July 7, 2026") for prompts that do duration math — without an
// anchor, Claude resolves "Present" against its training data and computes
// durations years short.
const todayFullDate = () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

// "May 2024 – Present", "Jan 2020 - Mar 2022", "2019 – 2021" → months (0 if unparseable)
function durationToMonths(duration) {
    if (!duration || typeof duration !== 'string') return 0;
    const now = new Date();
    const norm = duration.toLowerCase().replace(/–|—/g, '-');
    const parts = norm.split('-').map(s => s.trim());
    if (parts.length !== 2) return 0;
    const parse = (s) => {
        if (/present|current|now|ongoing|today/.test(s)) return { y: now.getFullYear(), m: now.getMonth() };
        const my = /([a-z]{3,9})\.?\s+(\d{4})/.exec(s);
        if (my) {
            const m = MONTHS[my[1].slice(0, 3)];
            if (m !== undefined) return { y: Number(my[2]), m };
        }
        const yOnly = /(^|\s)(\d{4})(\s|$)/.exec(s);
        if (yOnly) return { y: Number(yOnly[2]), m: 0 };
        return null;
    };
    const a = parse(parts[0]);
    const b = parse(parts[1]);
    if (!a || !b) return 0;
    const months = (b.y - a.y) * 12 + (b.m - a.m);
    return months > 0 && months < 600 ? months : 0;
}

// Max years the JD hard-requires; 0 when none stated. Only counts numbers
// tied to the word "experience" nearby, so postings' unrelated numerals don't gate.
function jdRequiredYears(jdRaw) {
    const text = String(jdRaw || '');
    let max = 0;
    const patterns = [
        /(\d{1,2})\s*\+\s*years?/gi,
        /(?:minimum|min\.?|at least)\s+(?:of\s+)?(\d{1,2})\s+years?/gi,
        /(\d{1,2})\s*[-–]\s*\d{1,2}\s+years?/gi,
    ];
    for (const re of patterns) {
        let m;
        while ((m = re.exec(text)) !== null) {
            const window = text.slice(m.index, m.index + m[0].length + 60);
            if (!/experience|exp\b/i.test(window)) continue;
            const years = Number(m[1]);
            if (years >= 1 && years <= 25 && years > max) max = years;
        }
    }
    return max;
}

// Candidate's total years: sum of role durations, with a resume-text fallback.
function candidateYears(experienceArr, resumeRaw) {
    let months = 0;
    for (const exp of (experienceArr || [])) months += durationToMonths(exp && exp.duration);
    let fromText = 0;
    const m = /(\d{1,2})\s*\+?\s*years?\s+of\s+experience/i.exec(String(resumeRaw || ''));
    if (m) fromText = Number(m[1]);
    return Math.max(Math.round((months / 12) * 10) / 10, fromText);
}

function deterministicPrecheck(work_auth, resumeRow, suppText, jdRaw) {
    const checks = [];

    // a) Work authorization — existing regex gate, verbatim
    const gate = visaGate(work_auth, jdRaw);
    checks.push({
        name: 'work_authorization',
        requirement: gate.eligible ? 'no blocking authorization language found' : 'authorization to work without sponsorship',
        candidate: work_auth,
        verdict: gate.eligible ? 'pass' : 'fail',
        reason: gate.eligible ? 'No sponsorship restrictions detected in the posting.' : gate.message,
    });

    // b) Years of experience — fail only on a clear shortfall
    const reqYears = jdRequiredYears(jdRaw);
    const haveYears = candidateYears(asArray(resumeRow.experience), resumeRow.raw_text);
    if (reqYears > 0 && haveYears > 0 && haveYears + YEARS_HARD_GAP <= reqYears) {
        checks.push({
            name: 'experience',
            requirement: `${reqYears}+ years`,
            candidate: `~${haveYears} years`,
            verdict: 'fail',
            reason: `The posting requires ${reqYears}+ years of experience; your resume shows roughly ${haveYears}.`,
        });
    } else {
        checks.push({
            name: 'experience',
            requirement: reqYears > 0 ? `${reqYears}+ years` : 'not stated',
            candidate: haveYears > 0 ? `~${haveYears} years` : 'not computed',
            verdict: 'pass',
            reason: reqYears > 0 ? 'Within range of the stated requirement.' : 'No hard experience requirement detected.',
        });
    }

    // c) Tech-stack floor — fail only when the stacks barely overlap
    const jdTech = detectTechTerms(jdRaw);
    let techStats = { tech_found: jdTech.length, tech_matched: 0 };
    if (jdTech.length >= MIN_JD_TECH_TERMS) {
        const coverage = matchKeywords(dedupeKeywords(jdTech), [
            { name: 'resume', text: resumeRow.raw_text || '' },
            { name: 'supplements', text: suppText || '' },
        ]);
        techStats.tech_matched = coverage.matched_count;
        const fail = coverage.score < TECH_FLOOR;
        checks.push({
            name: 'core_skills',
            requirement: `${jdTech.length} technologies mentioned (${jdTech.slice(0, 6).map(t => t.term).join(', ')}${jdTech.length > 6 ? '…' : ''})`,
            candidate: `${coverage.matched_count} present in your resume`,
            verdict: fail ? 'fail' : 'pass',
            reason: fail
                ? 'This role\'s tech stack barely overlaps with your resume — fewer than 1 in 5 of its technologies appear.'
                : 'Sufficient overlap with the posting\'s tech stack.',
        });
    }

    return {
        eligible: checks.every(c => c.verdict === 'pass'),
        checks,
        stats: { jd_years: reqYears, candidate_years: haveYears, ...techStats },
    };
}

// ── Hard eligibility checks (extension flow) ────────────────────────────────
// One Claude call compares the raw resume against the raw JD and returns a
// verdict per hard requirement. All non-visa checks hard-block: any `fail`
// means the job is ineligible and nothing gets scored or logged. The prompt
// is deliberately conservative — only fail on requirements the JD states as
// hard AND the resume clearly misses — to avoid false blocks on reach roles
// the user is still allowed to pursue only when the JD truly permits it.
async function runEligibilityChecks(resumeRaw, jdRaw) {
    try {
        const parsed = await callClaude({
            label: 'eligibility',
            model: MODELS.EXTRACTION,
            maxTokens: 1200,
            // 0 — this gate re-runs on every analyze and is not cached; a
            // borderline candidate must not flip between eligible/ineligible
            // across runs of the same job.
            temperature: 0,
            prompt: buildEligibilityPrompt(resumeRaw, jdRaw, todayFullDate()),
            schema: ELIGIBILITY_SCHEMA,
        });
        const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
        const failed = checks.filter(c => c && c.verdict === 'fail');
        if (failed.length > 0) {
            const summary = failed.map(f => f.name.replace(/_/g, ' ')).join(', ');
            return {
                eligible: false,
                checks,
                message: `This role has hard requirements you don't currently meet (${summary}). It wasn't added to your tracker.`,
            };
        }
        return { eligible: true, checks };
    } catch {
        // If the check itself fails, do NOT silently pass a job through the
        // gate — fail closed with an explanatory (non-blocking-data) check.
        return {
            eligible: false,
            checks: [{ name: 'eligibility_check', requirement: 'automated screen', candidate: 'unavailable', verdict: 'fail', reason: 'Could not complete the eligibility check — please try again.' }],
            message: 'Eligibility check could not be completed. Nothing was added; please try again.',
        };
    }
}

// ── Resume gap detection (links, generic names, tutorial-tier projects) ─────
const GENERIC_PROJECT_NAMES = ['todo', 'calculator', 'weather', 'notes app', 'note app', 'recipe', 'exercise', 'hello world', 'crud', 'to-do', 'to do'];
const TUTORIAL_SIGNALS = ['tutorial', 'course project', 'assignment', 'following along', 'learning project', 'bootcamp project'];

function detectResumeGaps(parsedResumeRow, projectRows) {
    const projects = asArray(parsedResumeRow.projects);
    const experience = asArray(parsedResumeRow.experience);

    const projectLinkMap = {};
    for (const row of (projectRows || [])) {
        projectLinkMap[row.project_name] = row;
    }

    const missing_project_links = [];
    const generic_project_names = [];
    const tutorial_projects = [];

    for (const proj of projects) {
        const dbRow = projectLinkMap[proj.name] || {};
        const needsGithub = !dbRow.github_url;
        const needsDemo   = !dbRow.live_url;
        if (needsGithub || needsDemo) {
            missing_project_links.push({ name: proj.name, needs_github: needsGithub, needs_demo: needsDemo });
        }
        if (GENERIC_PROJECT_NAMES.some(g => proj.name.toLowerCase().includes(g))) {
            generic_project_names.push(proj.name);
        }
        const desc = (proj.description || '').toLowerCase();
        if (TUTORIAL_SIGNALS.some(s => desc.includes(s))) {
            tutorial_projects.push(proj.name);
        }
    }

    return {
        missing_project_links,
        generic_project_names,
        tutorial_projects,
        missing_github_profile:  !parsedResumeRow.github_url,
        missing_linkedin:        !parsedResumeRow.linkedin_url,
        missing_portfolio:       !parsedResumeRow.portfolio_url,
        missing_work_experience: experience.length === 0,
        has_open_source_opportunity: projects.length <= 3,
    };
}

// ── Prompt-block builders ────────────────────────────────────────────────────
function buildEnrichmentBlock(parsedResumeRow, projectRows) {
    const social = [];
    if (parsedResumeRow.github_url)    social.push(`• GitHub: ${parsedResumeRow.github_url}`);
    if (parsedResumeRow.linkedin_url)  social.push(`• LinkedIn: ${parsedResumeRow.linkedin_url}`);
    if (parsedResumeRow.portfolio_url) social.push(`• Portfolio: ${parsedResumeRow.portfolio_url}`);

    const projectLinks = (projectRows || [])
        .filter(r => r.github_url || r.live_url)
        .map(r => {
            const parts = [];
            if (r.github_url) parts.push(`GitHub: ${r.github_url}`);
            if (r.live_url)   parts.push(`Live: ${r.live_url}`);
            return `• "${r.project_name}" → ${parts.join(' | ')}`;
        });

    const hasOSNotes = parsedResumeRow.open_source_notes && parsedResumeRow.open_source_notes.trim();

    if (social.length === 0 && projectLinks.length === 0 && !hasOSNotes) return '';

    const sections = [];
    if (social.length > 0) {
        sections.push(`PROFILE LINKS (add to contact header after phone/email):\n${social.join('\n')}`);
    }
    if (projectLinks.length > 0) {
        sections.push(`PROJECT LINKS (add a "Links:" line immediately after each project title below):\n${projectLinks.join('\n')}\nFormat: Links: GitHub: <url> | Live: <url>`);
    }
    if (hasOSNotes) {
        sections.push(`OPEN SOURCE CONTRIBUTIONS (add as a dedicated "Open Source" subsection under PROJECTS — these are real contributions to external repositories, which is different from personal projects):\n${parsedResumeRow.open_source_notes.trim()}`);
    }

    return `═══════════════════════════════════════
USER-VERIFIED ENRICHMENTS — include ALL of these exactly as given. Do not modify or omit any URL:
═══════════════════════════════════════
${sections.join('\n\n')}

Contact header format: Name | Phone | Email | GitHub: <url> | LinkedIn: <url> | Portfolio: <url>
═══════════════════════════════════════

`;
}

function buildSupplementsBlock(supplements) {
    if (!supplements || supplements.length === 0) return '';
    const lines = supplements.map(s =>
        s.keyword ? `• [${s.keyword}] ${s.content}` : `• ${s.content}`
    );
    return `═══════════════════════════════════════
USER-PROVIDED ADDITIONAL FACTS (verified by the user — treat these as truthfully as the resume itself; weave them into the relevant sections and bullets):
═══════════════════════════════════════
${lines.join('\n')}
═══════════════════════════════════════

`;
}

function supplementsText(supplements) {
    return (supplements || [])
        .map(s => (s.keyword ? `${s.keyword}: ${s.content}` : s.content))
        .join('\n');
}

async function fetchSupplements(user_id, resume_id) {
    const result = await pool.query(
        `SELECT keyword, content FROM resume_supplements
         WHERE user_id = $1 AND resume_id = $2 ORDER BY id ASC`,
        [user_id, resume_id]
    );
    return result.rows;
}

async function fetchProjectRows(user_id, resume_id) {
    const result = await pool.query(
        `SELECT project_name, github_url, live_url FROM resume_projects
         WHERE resume_id = $1 AND user_id = $2`,
        [resume_id, user_id]
    );
    return result.rows;
}

// Persist a fresh resume parse and fold it into the in-memory row so
// downstream consumers (deterministic precheck, gap detection, parseTask
// skip) see the parsed data without a re-read.
async function persistResumeParse(user_id, resume_id, parsedResume, parsedResumeRow) {
    await pool.query(
        `UPDATE resume_parsed_data
         SET name=$1, email=$2, phone=$3, summary=$4, skills=$5, experience=$6, education=$7, projects=$8,
             github_url=$9, linkedin_url=$10, portfolio_url=$11
         WHERE resume_id=$12 AND user_id=$13`,
        [
            parsedResume.name, parsedResume.email, parsedResume.phone, parsedResume.summary,
            JSON.stringify(parsedResume.skills),
            JSON.stringify(parsedResume.experience),
            JSON.stringify(parsedResume.education),
            JSON.stringify(parsedResume.projects),
            parsedResume.github_url || null,
            parsedResume.linkedin_url || null,
            parsedResume.portfolio_url || null,
            resume_id, user_id
        ]
    );
    const projects = parsedResume.projects || [];
    if (projects.length > 0) {
        await pool.query(
            `INSERT INTO resume_projects (user_id, resume_id, project_name, github_url, live_url)
SELECT $1, $2, UNNEST($3::text[]), UNNEST($4::text[]), UNNEST($5::text[])
ON CONFLICT (resume_id, project_name) DO NOTHING`,
            [user_id, resume_id,
             projects.map(p => p.name),
             projects.map(p => p.github_url || null),
             projects.map(p => p.live_url   || null)]
        );
    }
    parsedResumeRow.name          = parsedResume.name;
    parsedResumeRow.github_url    = parsedResume.github_url    || null;
    parsedResumeRow.linkedin_url  = parsedResume.linkedin_url  || null;
    parsedResumeRow.portfolio_url = parsedResume.portfolio_url || null;
    parsedResumeRow.experience    = parsedResume.experience;
    parsedResumeRow.projects      = parsedResume.projects;
}

// ════════════════════════════════════════════════════════════════════════════
// POST /precheck — instant, FREE eligibility gate. Pure regex/arithmetic
// against stored resume data: zero Claude calls, no DB writes, ~10ms. The
// extension calls this on the raw scraped page text BEFORE spending any AI
// credits; obviously-ineligible jobs stop here. apiLimiter only — this must
// never eat into the AI budget.
// ════════════════════════════════════════════════════════════════════════════
router.post('/precheck', verifyToken, apiLimiter, async (req, res) => {
    try {
        const user_id = req.user.user.id;
        const { resume_id, raw_text } = req.body;
        if (!resume_id || typeof raw_text !== 'string' || raw_text.trim().length < 50) {
            return res.status(400).json({ error: 'resume_id and raw_text are required', message: 'generateRoutes' });
        }

        const [visaResult, resumeResult, supplements] = await Promise.all([
            pool.query(`SELECT work_authorization_status FROM users WHERE id = $1`, [user_id]),
            pool.query(
                `SELECT raw_text, experience FROM resume_parsed_data WHERE user_id = $1 AND resume_id = $2`,
                [user_id, resume_id]
            ),
            fetchSupplements(user_id, resume_id),
        ]);
        if (resumeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found', message: 'generateRoutes' });
        }

        const result = deterministicPrecheck(
            visaResult.rows[0].work_authorization_status,
            resumeResult.rows[0],
            supplementsText(supplements),
            raw_text
        );

        res.json({ success: true, eligible: result.eligible, checks: result.checks, stats: result.stats });
    } catch (err) {
        respondError(res, err, 'generateRoutes', 'Eligibility precheck failed. Please try again.');
    }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /analyze — phase 1 of the flow.
// Visa gate → JD parse (reused if same JD text seen before) → keyword
// extraction (Claude, stored once) → resume parse (cached) → holistic fit
// (Claude) → DETERMINISTIC keyword coverage (code) → gap report.
// Nothing is generated here; the user sees honest numbers first.
// ════════════════════════════════════════════════════════════════════════════
router.post('/analyze', verifyToken, aiLimiter, async (req, res) => {
    try {
        const user_id = req.user.user.id;
        const { resume_id, raw_text, job_title, company_name, strict_eligibility = false, jd_meta = null } = req.body;

        if (!resume_id || !raw_text || !job_title || !company_name) {
            return res.status(400).json({ error: 'resume_id, raw_text, job_title and company_name are required', message: 'generateRoutes' });
        }

        // ── Parallel initial reads (one round-trip instead of three) ───────
        const [visaResult, resumeRowResult, existingJob] = await Promise.all([
            pool.query(`SELECT work_authorization_status FROM users WHERE id = $1`, [user_id]),
            pool.query(
                `SELECT name, raw_text, experience, projects, github_url, linkedin_url, portfolio_url, open_source_notes
                 FROM resume_parsed_data WHERE user_id = $1 AND resume_id = $2`,
                [user_id, resume_id]
            ),
            // md5 comparison hits the (user_id, md5(raw_text)) expression index
            pool.query(
                `SELECT id, location, salary, experience_needed, preferred_qualifications, must_have_qualifications, extracted_keywords
                 FROM job_descriptions WHERE user_id = $1 AND md5(raw_text) = md5($2)
                 ORDER BY id DESC LIMIT 1`,
                [user_id, raw_text]
            ),
        ]);

        // Visa gate must fire before any job_descriptions insert
        const gate = visaGate(visaResult.rows[0].work_authorization_status, raw_text);
        if (!gate.eligible) {
            return res.json({ success: false, eligible: false, message: gate.message });
        }
        if (resumeRowResult.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found', message: 'generateRoutes' });
        }
        const parsedResumeRow = resumeRowResult.rows[0];
        const resumeRaw = parsedResumeRow.raw_text;

        // ── Strict eligibility gate (extension flow) — all checks hard-block ─
        // Two stages, cheapest first:
        //   1. deterministic precheck (regex/arithmetic, $0) — catches obvious
        //      misses so they never reach the LLM even server-side
        //   2. Claude eligibility check (one small call) — the nuanced authority
        // Ineligible jobs write NOTHING to the DB.
        let eligibilityChecks = [];
        if (strict_eligibility) {
            if (!resumeRaw || resumeRaw.trim().length < 100) {
                return res.status(400).json({
                    error: 'This resume has no readable text — re-upload it in Profile, then try again.',
                    message: 'generateRoutes',
                });
            }

            // A never-parsed resume has no experience[] durations, which
            // silently blinds the deterministic years check below. Parse it
            // FIRST — a one-time cost per resume; every later analysis (and
            // the /precheck endpoint) reuses the stored result.
            if (!parsedResumeRow.name) {
                const parsedResume = await callClaude({
                    label: 'resume-parse',
                    model: MODELS.EXTRACTION,
                    maxTokens: 2500,
                    prompt: buildResumeParsePrompt(resumeRaw),
                    schema: RESUME_PARSE_SCHEMA,
                });
                await persistResumeParse(user_id, resume_id, parsedResume, parsedResumeRow);
            }

            const strictSupps = await fetchSupplements(user_id, resume_id);
            const det = deterministicPrecheck(
                visaResult.rows[0].work_authorization_status,
                parsedResumeRow,
                supplementsText(strictSupps),
                raw_text
            );
            if (!det.eligible) {
                return res.json({
                    success: true,
                    eligible: false,
                    checks: det.checks,
                    message: 'This role has hard requirements you don\'t currently meet. It wasn\'t added to your tracker.',
                });
            }

            const checkResult = await runEligibilityChecks(resumeRaw, raw_text);
            eligibilityChecks = checkResult.checks;
            if (!checkResult.eligible) {
                return res.json({
                    success: true,
                    eligible: false,
                    checks: eligibilityChecks,
                    message: checkResult.message,
                });
            }
        }

        // ── Reuse cached JD parse + keywords when this exact JD was analyzed before ─
        let job_id = null;
        let jdData = null;
        let storedKeywords = null;

        // jd_meta: pre-parsed JD fields from the extension's extraction call —
        // same trust level as raw_text itself (both client-supplied). Using it
        // skips the JD-parse Claude call for new jobs. Shape-validated here.
        const validJdMeta = (m) => {
            if (!m || typeof m !== 'object') return null;
            const str = (v) => (typeof v === 'string' ? v.slice(0, 500) : '');
            const arr = (v) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 40) : []);
            const out = {
                location: str(m.location),
                salary: str(m.salary) || 'Not specified',
                experience_needed: str(m.experience_needed),
                preferred_qualifications: arr(m.preferred_qualifications),
                must_have_qualifications: arr(m.must_have_qualifications),
            };
            // Only usable if it carries real content
            return (out.must_have_qualifications.length > 0 || out.preferred_qualifications.length > 0) ? out : null;
        };

        if (existingJob.rows.length > 0) {
            const row = existingJob.rows[0];
            job_id = row.id;
            const storedMust = asArray(row.must_have_qualifications);
            const storedPref = asArray(row.preferred_qualifications);
            // Reuse stored quals only when they exist — a row whose quals were
            // cleared (e.g. to purge a stale categorization) falls through to
            // a fresh JD parse instead of resurrecting empty lists.
            if (storedMust.length > 0 || storedPref.length > 0) {
                jdData = {
                    location: row.location,
                    salary: row.salary,
                    experience_needed: row.experience_needed,
                    preferred_qualifications: storedPref,
                    must_have_qualifications: storedMust,
                };
            }
            const existingKw = asArray(row.extracted_keywords);
            if (existingKw.length > 0) storedKeywords = existingKw;
        } else if (jd_meta) {
            // New JD + extension already extracted the metadata → skip the
            // JD-parse Claude call entirely.
            jdData = validJdMeta(jd_meta);
        }

        // ── Independent Claude calls run CONCURRENTLY. JD parse, keyword
        //    extraction, and resume parse each need only raw inputs — running
        //    them sequentially would triple the wait for no benefit. Each is
        //    skipped entirely when a cached result exists (cost: $0). ────────
        const jdTask = jdData ? Promise.resolve(null) : callClaude({
            label: 'jd-parse',
            model: MODELS.EXTRACTION,
            maxTokens: 1500,
            prompt: buildJdParsePrompt(raw_text),
            schema: JD_PARSE_SCHEMA,
        });

        const kwTask = storedKeywords ? Promise.resolve(null) : callClaude({
            label: 'keywords',
            model: MODELS.GENERATION,
            maxTokens: 4000,
            temperature: 0,
            prompt: buildKeywordsPrompt(raw_text),
            schema: KEYWORDS_SCHEMA,
        });

        const parseTask = parsedResumeRow.name ? Promise.resolve(null) : callClaude({
            label: 'resume-parse',
            model: MODELS.EXTRACTION,
            maxTokens: 2500,
            prompt: buildResumeParsePrompt(resumeRaw),
            schema: RESUME_PARSE_SCHEMA,
        });

        const [jdResult, kwResult, parseResult] = await Promise.all([jdTask, kwTask, parseTask]);

        if (jdResult) jdData = jdResult;
        if (kwResult) {
            storedKeywords = Array.isArray(kwResult.keywords) ? kwResult.keywords : [];
            if (storedKeywords.length === 0) {
                return res.status(500).json({ error: 'Keyword extraction returned no keywords — cannot score this JD.', message: 'generateRoutes' });
            }
        }

        // ── Persist JD: single INSERT (keywords included) for new JDs ──────
        if (job_id === null) {
            const jdInsert = await pool.query(
                `INSERT INTO job_descriptions
                    (user_id, job_title, company_name, raw_text, location, salary, experience_needed, preferred_qualifications, must_have_qualifications, extracted_keywords)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING id`,
                [
                    user_id, job_title, company_name, raw_text,
                    jdData.location,
                    jdData.salary || 'Not specified',
                    jdData.experience_needed,
                    JSON.stringify(jdData.preferred_qualifications),
                    JSON.stringify(jdData.must_have_qualifications),
                    JSON.stringify(storedKeywords)
                ]
            );
            job_id = jdInsert.rows[0].id;
        } else if (jdResult) {
            // The stored row's quals were blank and a fresh JD parse just ran —
            // persist the refreshed fields so the row heals permanently.
            // (NULLing quals + extracted_keywords on a job forces full
            // re-extraction on its next analyze.)
            await pool.query(
                `UPDATE job_descriptions
                 SET job_title = $1, company_name = $2, extracted_keywords = COALESCE(extracted_keywords, $3),
                     location = $4, salary = $5, experience_needed = $6,
                     preferred_qualifications = $7, must_have_qualifications = $8
                 WHERE id = $9`,
                [
                    job_title, company_name, JSON.stringify(storedKeywords),
                    jdData.location, jdData.salary || 'Not specified', jdData.experience_needed,
                    JSON.stringify(jdData.preferred_qualifications),
                    JSON.stringify(jdData.must_have_qualifications),
                    job_id
                ]
            );
        } else {
            await pool.query(
                `UPDATE job_descriptions
                 SET job_title = $1, company_name = $2, extracted_keywords = COALESCE(extracted_keywords, $3)
                 WHERE id = $4`,
                [job_title, company_name, JSON.stringify(storedKeywords), job_id]
            );
        }
        const keywords = dedupeKeywords(storedKeywords);

        // ── Persist resume parse if it just ran ─────────────────────────────
        if (parseResult) {
            await persistResumeParse(user_id, resume_id, parseResult, parsedResumeRow);
        }

        // ── Supplements + links (saved facts count toward the score) ───────
        const [supplements, projectRows] = await Promise.all([
            fetchSupplements(user_id, resume_id),
            fetchProjectRows(user_id, resume_id),
        ]);
        const suppText = supplementsText(supplements);

        // ── DETERMINISTIC keyword coverage — the honest score ──────────────
        const coverage = matchKeywords(keywords, [
            { name: 'resume', text: resumeRaw },
            { name: 'supplements', text: suppText },
        ]);

        // ── Evidence mining: before asking the user anything, check whether
        //    missing keywords are already covered in the resume under
        //    different wording. Every suggestion must carry a VERBATIM quote
        //    from the resume, validated in code — anything Claude can't
        //    quote gets dropped. This kills fabrication and cuts down how
        //    many questions the user sees. ──────────────────────────────────
        const minableMissing = coverage.missing
            .filter(m => m.category === 'must_have' || m.category === 'preferred')
            .slice(0, 25);
        const miningPromise = (async () => {
            if (minableMissing.length === 0) return { inferred: [], trainable: [] };
            const candidateMaterial = suppText ? `${resumeRaw}\n\nVERIFIED ADDITIONAL FACTS:\n${suppText}` : resumeRaw;
            try {
                const mined = await callClaude({
                    label: 'evidence-mining',
                    model: MODELS.GENERATION,
                    maxTokens: 2500,
                    // 0 — the skills buckets shown to the user must not
                    // shuffle between runs of the same job
                    temperature: 0,
                    prompt: buildEvidenceMiningPrompt(minableMissing.map(m => m.term), candidateMaterial),
                    schema: EVIDENCE_SCHEMA,
                });
                const normMaterial = normalize(candidateMaterial);
                const missingByTerm = new Map(minableMissing.map(m => [m.term, m]));
                const inferred = (Array.isArray(mined.inferred) ? mined.inferred : [])
                    .filter(it =>
                        it && it.term && it.quote &&
                        missingByTerm.has(it.term) &&
                        normMaterial.includes(normalize(it.quote))
                    )
                    .map(it => ({
                        term: it.term,
                        category: missingByTerm.get(it.term).category,
                        quote: String(it.quote).trim().slice(0, 250),
                    }));
                const inferredTerms = new Set(inferred.map(it => it.term));
                // Trainable = same-kind similar skill the material verifiably
                // names. Same anti-hallucination pattern as quotes: a
                // similar_skill absent from the material is discarded.
                const trainable = (Array.isArray(mined.trainable) ? mined.trainable : [])
                    .filter(it =>
                        it && it.term && it.similar_skill &&
                        missingByTerm.has(it.term) &&
                        !inferredTerms.has(it.term) &&
                        normMaterial.includes(normalize(it.similar_skill))
                    )
                    .map(it => ({
                        term: it.term,
                        category: missingByTerm.get(it.term).category,
                        similar_skill: String(it.similar_skill).trim().slice(0, 100),
                    }));
                return { inferred, trainable };
            } catch {
                // Evidence mining is best-effort — a failure here must never
                // block the analysis. The user just gets asked more questions.
                return { inferred: [], trainable: [] };
            }
        })();

        // ── Holistic fit (Claude judgment — separate from keyword coverage).
        //    Runs CONCURRENTLY with evidence mining above. ────────────────────
        const matchPromise = callClaude({
            label: 'holistic-match',
            model: MODELS.GENERATION,
            maxTokens: 1500,
            temperature: 0,
            prompt: buildMatchPrompt({
                resumeRaw,
                suppText,
                jdRaw: raw_text,
                mustHave: jdData.must_have_qualifications,
                preferred: jdData.preferred_qualifications,
                today: todayFullDate(),
            }),
            schema: MATCH_SCHEMA,
        });

        const [mining, matchResult] = await Promise.all([miningPromise, matchPromise]);
        const { inferred, trainable } = mining;

        // ── Skill-gap breakdown (display/decision aid ONLY — never feeds the
        //    ATS score; coverage stays strict keyword matching, locked
        //    decision 2). Buckets are disjoint, priority: proof > must-have
        //    gap > trainable > not covered. Domain terms are context
        //    vocabulary, not skills, and are excluded. ────────────────────────
        const inferredTermSet = new Set(inferred.map(i => i.term));
        const trainableTermSet = new Set(trainable.map(t => t.term));
        // Degrees/education are requirements, not skills — the eligibility
        // screen already judges them (it knows B.Tech = bachelor's; keyword
        // matching does not). Keep them out of the skills buckets so the two
        // sections can never contradict each other.
        const isEducationTerm = (t) => /bachelor|master|degree|diploma|phd|doctorate|b\.?tech|m\.?tech/i.test(t);
        const skills_breakdown = {
            must_have_missing: coverage.missing
                .filter(m => m.category === 'must_have' && !inferredTermSet.has(m.term) && !isEducationTerm(m.term))
                .map(m => m.term),
            proof_based: inferred,
            trainable: trainable.filter(t => t.category === 'preferred'),
            not_covered: coverage.missing
                .filter(m => m.category === 'preferred' && !inferredTermSet.has(m.term) && !trainableTermSet.has(m.term) && !isEducationTerm(m.term))
                .map(m => m.term),
        };

        // Must-have skills surface inside the eligibility checks list. This
        // entry is informational — a keyword-level miss must not hard-block a
        // job the way the strict gate does (synonym wording and B.Tech-style
        // equivalents make keyword absence too brittle to be a verdict).
        const mustHaveKwCount = keywords.filter(k => k.category === 'must_have' && !isEducationTerm(k.term)).length;
        if (mustHaveKwCount > 0) {
            const missingMust = skills_breakdown.must_have_missing;
            eligibilityChecks = [
                ...eligibilityChecks,
                {
                    name: 'must_have_skills',
                    requirement: `${mustHaveKwCount} must-have skill${mustHaveKwCount === 1 ? '' : 's'} named in the JD`,
                    candidate: `${mustHaveKwCount - missingMust.length} covered by your resume or direct evidence`,
                    verdict: missingMust.length === 0 ? 'pass' : 'fail',
                    reason: missingMust.length === 0
                        ? 'Every must-have skill is covered by your resume or direct evidence.'
                        : `Missing: ${missingMust.slice(0, 8).join(', ')}${missingMust.length > 8 ? ', …' : ''}.`,
                },
            ];
        }

        // ── Persist baseline scores ─────────────────────────────────────────
        await pool.query(
            `INSERT INTO resume_job_matches
                (user_id, resume_id, job_id, match_score, matching_skills, missing_skills, gaps, ats_score, keyword_matches, keyword_gaps)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (resume_id, job_id) DO UPDATE SET
                match_score = EXCLUDED.match_score,
                matching_skills = EXCLUDED.matching_skills,
                missing_skills = EXCLUDED.missing_skills,
                gaps = EXCLUDED.gaps,
                ats_score = EXCLUDED.ats_score,
                keyword_matches = EXCLUDED.keyword_matches,
                keyword_gaps = EXCLUDED.keyword_gaps`,
            [
                user_id, resume_id, job_id,
                Math.round(matchResult.match_score),
                JSON.stringify(matchResult.matching_skills),
                JSON.stringify(matchResult.missing_skills),
                JSON.stringify(matchResult.gaps),
                coverage.score,
                JSON.stringify(coverage.matched.map(m => m.term)),
                JSON.stringify(coverage.missing.map(m => m.term))
            ]
        );

        const resume_gaps = detectResumeGaps(parsedResumeRow, projectRows);

        res.json({
            success: true,
            eligible: true,
            data: {
                job_id,
                job: {
                    company_name,
                    job_title,
                    location: jdData.location,
                    salary: jdData.salary || 'Not specified',
                    experience_needed: jdData.experience_needed,
                    preferred_qualifications: jdData.preferred_qualifications,
                    must_have_qualifications: jdData.must_have_qualifications
                },
                match: {
                    match_score: matchResult.match_score,
                    matching_skills: matchResult.matching_skills,
                    missing_skills: matchResult.missing_skills,
                    gaps: matchResult.gaps
                },
                recommendation: recommendationFor(matchResult.match_score),
                coverage,
                inferred,
                skills_breakdown,
                resume_gaps,
                checks: eligibilityChecks
            }
        });

    } catch (err) {
        respondError(res, err, 'generateRoutes', 'Job analysis failed. Please try again.');
    }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /extract-job — pull {job_title, company_name, clean JD} out of a messy
// page scrape (extension fallback for pages where DOM anchors fail, e.g.
// LinkedIn's churning UI). The captured text contains the real posting mixed
// with side-panel job cards and navigation noise; one small Claude call
// separates them far more reliably than any client-side text surgery — and
// keeps that noise out of keyword extraction downstream. No DB writes.
// ════════════════════════════════════════════════════════════════════════════
router.post('/extract-job', verifyToken, aiLimiter, async (req, res) => {
    try {
        const raw = typeof req.body?.raw_text === 'string' ? req.body.raw_text.trim() : '';
        if (raw.length < 100) {
            return res.status(400).json({ error: 'raw_text with page content is required', message: 'generateRoutes' });
        }
        const text = raw.slice(0, 30000);

        const parsed = await callClaude({
            label: 'extract-job',
            model: MODELS.EXTRACTION,
            maxTokens: 5000,
            prompt: buildExtractJobPrompt(text),
            schema: EXTRACT_JOB_SCHEMA,
        });
        const job_title = typeof parsed.job_title === 'string' ? parsed.job_title.trim() : '';
        const company_name = typeof parsed.company_name === 'string' ? parsed.company_name.trim() : '';
        const job_description = typeof parsed.job_description === 'string' ? parsed.job_description.trim() : '';

        if (job_description.length < 200) {
            return res.status(422).json({ error: 'Could not identify a job description in the captured text.', message: 'generateRoutes' });
        }

        res.json({
            success: true,
            data: {
                job_title,
                company_name,
                raw_text: job_description,
                jd_meta: {
                    location: typeof parsed.location === 'string' ? parsed.location : '',
                    salary: typeof parsed.salary === 'string' && parsed.salary ? parsed.salary : 'Not specified',
                    experience_needed: typeof parsed.experience_needed === 'string' ? parsed.experience_needed : '',
                    preferred_qualifications: Array.isArray(parsed.preferred_qualifications) ? parsed.preferred_qualifications.filter(x => typeof x === 'string') : [],
                    must_have_qualifications: Array.isArray(parsed.must_have_qualifications) ? parsed.must_have_qualifications.filter(x => typeof x === 'string') : [],
                },
            },
        });
    } catch (err) {
        respondError(res, err, 'generateRoutes', 'Could not extract the job from the captured page. Please try again.');
    }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /finalize — phase 2 of the flow.
// Saves user-supplied gap evidence → tailors the resume with all verified
// material → DETERMINISTIC re-score → one corrective pass if the tailor
// dropped keywords the candidate verifiably has → cover letter → auto-save
// to tracker. Keywords the user didn't cover stay honest gaps.
// ════════════════════════════════════════════════════════════════════════════
router.post('/finalize', verifyToken, aiLimiter, async (req, res) => {
    try {
        const user_id = req.user.user.id;
        const { resume_id, job_id, generate_cover_letter = false, supplements: newSupplements = [] } = req.body;

        if (!resume_id || !job_id) {
            return res.status(400).json({ error: 'resume_id and job_id are required', message: 'generateRoutes' });
        }

        // ── Parallel initial reads ──────────────────────────────────────────
        const [resumeResult, jobResult, matchRow] = await Promise.all([
            pool.query(
                `SELECT raw_text, experience, projects, github_url, linkedin_url, portfolio_url, open_source_notes
                 FROM resume_parsed_data WHERE resume_id = $1 AND user_id = $2`,
                [resume_id, user_id]
            ),
            pool.query(
                `SELECT raw_text, job_title, company_name, must_have_qualifications, preferred_qualifications, extracted_keywords
                 FROM job_descriptions WHERE id = $1 AND user_id = $2`,
                [job_id, user_id]
            ),
            pool.query(
                `SELECT missing_skills FROM resume_job_matches
                 WHERE resume_id = $1 AND job_id = $2 AND user_id = $3`,
                [resume_id, job_id, user_id]
            ),
        ]);
        if (resumeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found', message: 'generateRoutes' });
        }
        const parsedResumeRow = resumeResult.rows[0];
        const resumeRaw = parsedResumeRow.raw_text;

        if (jobResult.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found', message: 'generateRoutes' });
        }
        const jobRow = jobResult.rows[0];
        const rawKeywords = asArray(jobRow.extracted_keywords);
        if (rawKeywords.length === 0) {
            return res.status(400).json({ error: 'Job has no extracted keywords — run analyze first.', message: 'generateRoutes' });
        }
        const keywords = dedupeKeywords(rawKeywords);
        const mustHave  = asArray(jobRow.must_have_qualifications);
        const preferred = asArray(jobRow.preferred_qualifications);
        const missingSkills = matchRow.rows.length > 0 ? asArray(matchRow.rows[0].missing_skills) : [];

        // ── Save new gap evidence. The unique index on (resume_id,
        //    md5(content)) makes ON CONFLICT the dedupe — one query per
        //    supplement instead of SELECT-then-INSERT. ──────────────────────
        const suppRows = newSupplements
            .map(supp => ({
                kind:    supp.kind || 'evidence',
                keyword: supp.keyword ? String(supp.keyword).trim().slice(0, 200) : null,
                content: (supp && supp.content ? String(supp.content) : '').trim(),
            }))
            .filter(r => r.content.length > 0);
        if (suppRows.length > 0) {
            await pool.query(
                `INSERT INTO resume_supplements (user_id, resume_id, kind, keyword, content)
                 SELECT $1, $2, UNNEST($3::text[]), UNNEST($4::text[]), UNNEST($5::text[])
                 ON CONFLICT (resume_id, md5(content)) DO NOTHING`,
                [user_id, resume_id,
                 suppRows.map(r => r.kind),
                 suppRows.map(r => r.keyword),
                 suppRows.map(r => r.content.slice(0, 2000))]
            );
        }

        const [supplements, projectRows] = await Promise.all([
            fetchSupplements(user_id, resume_id),
            fetchProjectRows(user_id, resume_id),
        ]);
        const suppText = supplementsText(supplements);

        // ── Baseline: what the candidate verifiably has (resume + facts) ───
        const baseline = matchKeywords(keywords, [
            { name: 'resume', text: resumeRaw },
            { name: 'supplements', text: suppText },
        ]);
        // The ONLY keywords the tailor is allowed to mirror. Uncovered
        // keywords stay honest gaps — we never fabricate coverage.
        const candidateHasTerms = baseline.matched.map(m => m.term);

        const enrichmentBlock  = buildEnrichmentBlock(parsedResumeRow, projectRows);
        const supplementsBlock = buildSupplementsBlock(supplements);

        // ── Tailor chain and cover-letter chain run CONCURRENTLY — the
        //    cover letter depends only on the original resume + JD, not on
        //    the tailored output, so serializing them doubled the wait. ──────
        const tailorChain = (async () => {
        let tailoredResume;
        try {
            tailoredResume = await callClaude({
                label: 'tailor',
                model: MODELS.GENERATION,
                maxTokens: 4096,
                prompt: buildTailorPrompt({
                    enrichmentBlock,
                    supplementsBlock,
                    resumeRaw,
                    jdRaw: jobRow.raw_text,
                    mustHave,
                    preferred,
                    missingSkills,
                    candidateHasTerms,
                    today: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                }),
            });
        } catch (err) {
            if (err.code === 'CLAUDE_TRUNCATED') {
                throw new UserFacingError('Resume too long — output was cut off. Try a shorter resume.');
            }
            throw err;
        }

        // ── Deterministic score of the tailored output ──────────────────────
        let finalCoverage = matchKeywords(keywords, [{ name: 'resume', text: tailoredResume }]);

        // ── Corrective pass: keywords the candidate HAS but the tailor
        //    dropped. One retry max — enforcement in code, not trust. ────────
        const candidateHasSet = new Set(candidateHasTerms);
        const droppedTerms = finalCoverage.missing
            .filter(m => candidateHasSet.has(m.term))
            .map(m => m.term);

        if (droppedTerms.length > 0) {
            try {
                const fixed = await callClaude({
                    label: 'tailor-fix',
                    model: MODELS.GENERATION,
                    maxTokens: 4096,
                    prompt: buildTailorFixPrompt({ droppedTerms, resumeRaw, suppText, tailoredResume }),
                });
                const fixedCoverage = matchKeywords(keywords, [{ name: 'resume', text: fixed }]);
                // Keep the correction only if it actually improved coverage
                if (fixedCoverage.score >= finalCoverage.score) {
                    tailoredResume = fixed;
                    finalCoverage = fixedCoverage;
                }
            } catch (err) {
                // Corrective pass is best-effort — on truncation or API failure
                // keep the original tailored output and its honest score.
                console.error(err);
            }
        }

        return { tailoredResume, finalCoverage };
        })();

        // ── Cover letter chain (optional, with ground-truth guard) ──────────
        const coverChain = (async () => {
            if (!generate_cover_letter) return null;
            const experienceData = asArray(parsedResumeRow.experience);
            const projectsData   = asArray(parsedResumeRow.projects);

            // Ground truth comes straight from stored parsed data — the resume
            // parse now captures technologies per role and per project, so no
            // Claude call is needed. Fallback: rows parsed before
            // experience[].technologies existed get ONE extraction call.
            const asTechList = (v) => Array.isArray(v) ? v
                : (typeof v === 'string' && v.trim() ? v.split(/,\s*/) : []);
            const isNewFormat = experienceData.length === 0 ||
                experienceData.every(e => Array.isArray(e.technologies));

            let expTech, projTech;
            if (isNewFormat) {
                expTech = experienceData.map(e => ({ title: e.title, company: e.company, technologies: asTechList(e.technologies) }));
                projTech = projectsData.map(p => ({ name: p.name, technologies: asTechList(p.technologies) }));
            } else {
                const techData = await callClaude({
                    label: 'tech-extract-legacy',
                    model: MODELS.EXTRACTION,
                    maxTokens: 1000,
                    prompt: buildTechExtractionPrompt(experienceData, projectsData),
                    schema: TECH_EXTRACTION_SCHEMA,
                });
                expTech = techData.experience || [];
                projTech = techData.projects || [];
            }

            const experienceTech = expTech.map(exp =>
                `- ${exp.title} at ${exp.company}: ${(exp.technologies || []).join(', ') || '(no technologies named for this role)'}`
            ).join('\n');
            const projectTech = projTech.map(project =>
                `- ${project.name}: ${(project.technologies || []).join(', ') || '(no technologies named for this project)'}`
            ).join('\n');

            return callClaude({
                label: 'cover-letter',
                model: MODELS.GENERATION,
                maxTokens: 1500,
                prompt: buildCoverLetterPrompt({
                    resumeRaw,
                    suppText,
                    jdRaw: jobRow.raw_text,
                    experienceTech,
                    projectTech,
                    today: todayFullDate(),
                }),
            });
        })();

        const [{ tailoredResume, finalCoverage }, coverLetter] = await Promise.all([tailorChain, coverChain]);

        // ── Persist docs + honest final score ───────────────────────────────
        await pool.query(
            `UPDATE resume_job_matches
             SET tailored_resume = $1,
                 ats_score = $2,
                 keyword_matches = $3,
                 keyword_gaps = $4,
                 cover_letter = COALESCE($5, cover_letter)
             WHERE user_id = $6 AND resume_id = $7 AND job_id = $8`,
            [
                tailoredResume,
                finalCoverage.score,
                JSON.stringify(finalCoverage.matched.map(m => m.term)),
                JSON.stringify(finalCoverage.missing.map(m => m.term)),
                coverLetter,
                user_id, resume_id, job_id
            ]
        );

        // ── Auto-save application (locked decision: automatic on generate) ──
        const existingApp = await pool.query(
            `SELECT id FROM job_applications WHERE user_id = $1 AND job_id = $2 LIMIT 1`,
            [user_id, job_id]
        );
        let application_id;
        if (existingApp.rows.length === 0) {
            const appInsert = await pool.query(
                `INSERT INTO job_applications (user_id, resume_id, job_id) VALUES ($1, $2, $3) RETURNING id`,
                [user_id, resume_id, job_id]
            );
            application_id = appInsert.rows[0].id;
        } else {
            application_id = existingApp.rows[0].id;
        }

        const resume_gaps = detectResumeGaps(parsedResumeRow, projectRows);

        res.json({
            success: true,
            data: {
                application_id,
                tailored_resume: tailoredResume,
                cover_letter: coverLetter,
                cover_letter_generated: !!coverLetter,
                coverage: { ...finalCoverage, target_met: finalCoverage.score >= 70 },
                baseline_coverage: baseline,
                resume_gaps
            }
        });

    } catch (err) {
        respondError(res, err, 'generateRoutes', 'Document generation failed. Please try again.');
    }
});

module.exports = router;
// Internal helpers exposed for unit tests only — not part of the route API.
module.exports.__precheck = { durationToMonths, jdRequiredYears, candidateYears, deterministicPrecheck };
