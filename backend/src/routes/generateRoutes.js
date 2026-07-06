const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');
const { aiLimiter, apiLimiter } = require('../middleware/rateLimiters');
const Anthropic = require('@anthropic-ai/sdk');
const { parseClaudeJson } = require('../utils/parseClaudeJson');
const { dedupeKeywords, matchKeywords, normalize, detectTechTerms } = require('../utils/keywordMatcher');
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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1200,
            messages: [{
                role: 'user',
                content: `You are a strict job-application eligibility screener. Compare the CANDIDATE RESUME against the JOB DESCRIPTION and decide, for each hard requirement, whether the candidate is eligible.

Evaluate these dimensions (include a check only when the JD actually states a requirement for it):
- "experience": years / seniority the JD hard-requires vs. what the resume shows
- "graduation_year": if the JD targets a specific grad year / class (e.g. new-grad 2024, or "must graduate by 2025"), compare to the resume's graduation year
- "degree": a hard-required degree/field vs. the resume
- "hard_requirements": other explicit disqualifiers stated as mandatory (e.g. active security clearance, specific license/certification, on-site in a named location with no remote)

RULES:
- verdict is "pass" or "fail"
- Only "fail" when the JD states the requirement as HARD/REQUIRED and the resume CLEARLY does not meet it
- If the requirement is a preference ("nice to have", "preferred", "a plus") OR the JD is silent OR it's ambiguous OR the resume plausibly meets it → "pass"
- Do NOT invent requirements not present in the JD
- Keep "requirement" and "candidate" short factual phrases; "reason" one sentence

Return ONLY valid JSON, no other text:
{"checks": [{"name": "experience", "requirement": "", "candidate": "", "verdict": "pass", "reason": ""}]}

CANDIDATE RESUME:
${resumeRaw}

JOB DESCRIPTION:
${jdRaw}`
            }]
        });
        const parsed = parseClaudeJson(message.content[0].text);
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
        res.status(500).json({ error: err.message, message: 'generateRoutes' });
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
            jdData = {
                location: row.location,
                salary: row.salary,
                experience_needed: row.experience_needed,
                preferred_qualifications: asArray(row.preferred_qualifications),
                must_have_qualifications: asArray(row.must_have_qualifications),
            };
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
        const jdTask = jdData ? Promise.resolve(null) : anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{
                role: 'user',
                content: `You are a job description parser. Extract the following from this job description and return valid JSON only, no other text:

{
    "location": "",
    "salary": "",
    "experience_needed": "",
    "preferred_qualifications": [],
    "must_have_qualifications": []
}

For salary: extract the full salary range/amount as a string (e.g. "$120k-$160k", "$180,000/yr"). If no salary is mentioned, return "Not specified".

Job description:
${raw_text}`
            }]
        });

        const kwTask = storedKeywords ? Promise.resolve(null) : anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4000,
            messages: [{
                role: 'user',
                content: `You are an ATS keyword extraction engine. From the job description below, enumerate EVERY distinct skill, technology, tool, platform, framework, methodology, certification, and domain term that a keyword-based ATS scanner would check a resume against.

Rules:
- "term": the exact wording used in the JD
- "category" — rank each keyword by how the JD itself weights it:
  - "must_have": listed under Requirements/Qualifications/Responsibilities, or framed with "required", "must", "need", "strong experience in", "proficiency in", years-of-experience demands
  - "preferred": framed as "nice to have", "good to have", "preferred", "a plus", "is a plus", "bonus", "extras", "would be great", "familiarity with", or listed under a Preferred/Bonus/Nice-to-have section
  - "domain": general industry or role vocabulary that appears in the JD body but is not an explicit requirement (e.g. "SaaS", "B2B", "agile")
- When the same skill appears both as required and as preferred, categorize it "must_have"
- "aliases": common abbreviations, full-form expansions, and alternate spellings of the term (e.g. "JavaScript" → ["JS"], "Amazon Web Services" → ["AWS"])
- Include soft-skill keywords only when the JD explicitly states them (e.g. "cross-functional collaboration")
- Do NOT invent terms that are not in the JD
- No duplicates
- A full JD typically yields 30–80 keywords

Return ONLY valid JSON, no other text:
{"keywords": [{"term": "", "category": "must_have", "aliases": [""]}]}

Job description:
${raw_text}`
            }]
        });

        const parseTask = parsedResumeRow.name ? Promise.resolve(null) : anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{
                role: 'user',
                content: `You are a resume parser. Extract the following information from this resume text and return it as valid JSON only, no other text:

        {
            "name": "full name",
            "email": "email address",
            "phone": "phone number",
            "summary": "professional summary or objective",
            "skills": ["skill1", "skill2"],
            "experience": [{"company": "", "title": "", "duration": "", "description": ""}],
            "education": [{"institution": "", "degree": "", "year": ""}],
            "projects": [{"name": "", "description": "", "technologies": "", "github_url": "GitHub repo URL for this project if present, else null", "live_url": "Live demo URL for this project if present, else null"}],
            "github_url": "GitHub profile URL (github.com/username) if present, else null",
            "linkedin_url": "LinkedIn profile URL (linkedin.com/in/...) if present, else null",
            "portfolio_url": "Personal website/portfolio URL (NOT GitHub, NOT LinkedIn) if present, else null"
        }

        Resume text:
        ${resumeRaw}`
            }]
        });

        const [jdMessage, kwMessage, parseMessage] = await Promise.all([jdTask, kwTask, parseTask]);

        if (jdMessage) jdData = parseClaudeJson(jdMessage.content[0].text);
        if (kwMessage) {
            const kwData = parseClaudeJson(kwMessage.content[0].text);
            storedKeywords = Array.isArray(kwData.keywords) ? kwData.keywords : [];
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
        if (parseMessage) {
            const parsedResume = parseClaudeJson(parseMessage.content[0].text);
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
            for (const proj of (parsedResume.projects || [])) {
                await pool.query(
                    `INSERT INTO resume_projects (user_id, resume_id, project_name, github_url, live_url)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (resume_id, project_name) DO NOTHING`,
                    [user_id, resume_id, proj.name, proj.github_url || null, proj.live_url || null]
                );
            }
            parsedResumeRow.github_url    = parsedResume.github_url    || null;
            parsedResumeRow.linkedin_url  = parsedResume.linkedin_url  || null;
            parsedResumeRow.portfolio_url = parsedResume.portfolio_url || null;
            parsedResumeRow.experience    = parsedResume.experience;
            parsedResumeRow.projects      = parsedResume.projects;
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
            if (minableMissing.length === 0) return [];
            const candidateMaterial = suppText ? `${resumeRaw}\n\nVERIFIED ADDITIONAL FACTS:\n${suppText}` : resumeRaw;
            try {
                const mineMessage = await anthropic.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 2000,
                    messages: [{
                        role: 'user',
                        content: `You are a strict resume evidence auditor. For each keyword below, determine whether the candidate's material contains CONCRETE evidence of that exact skill or technology under different wording (e.g. "built REST endpoints with Express" is real evidence of "API development").

RULES:
- "quote" must be copied VERBATIM from the candidate material — a phrase or bullet, max 200 characters
- Only include a keyword when the material genuinely demonstrates that specific skill. Adjacent or related skills do NOT count (knowing JavaScript is NOT evidence of TypeScript; using MySQL is NOT evidence of PostgreSQL)
- If in doubt, leave it out. Omitting is always safer than stretching.
- Omit keywords with no real evidence entirely — do not include them with empty quotes

KEYWORDS TO CHECK:
${JSON.stringify(minableMissing.map(m => m.term))}

CANDIDATE MATERIAL:
${candidateMaterial}

Return ONLY valid JSON, no other text:
{"inferred": [{"term": "", "quote": ""}]}`
                    }]
                });
                const mined = parseClaudeJson(mineMessage.content[0].text);
                const normMaterial = normalize(candidateMaterial);
                const missingByTerm = new Map(minableMissing.map(m => [m.term, m]));
                return (Array.isArray(mined.inferred) ? mined.inferred : [])
                    .filter(it =>
                        it && it.term && it.quote &&
                        missingByTerm.has(it.term) &&
                        normMaterial.includes(normalize(it.quote))
                    )
                    .map(it => ({
                        term: it.term,
                        category: missingByTerm.get(it.term).category,
                        quote: String(it.quote).trim().slice(0, 300),
                    }));
            } catch {
                // Evidence mining is best-effort — a failure here must never
                // block the analysis. The user just gets asked more questions.
                return [];
            }
        })();

        // ── Holistic fit (Claude judgment — separate from keyword coverage).
        //    Runs CONCURRENTLY with evidence mining above. ────────────────────
        const matchPromise = anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{
                role: 'user',
                content: `You are a senior technical recruiter evaluating candidate fit for a role.

RESUME:
${resumeRaw}
${suppText ? `\nADDITIONAL CANDIDATE FACTS (user-verified):\n${suppText}\n` : ''}
JOB DESCRIPTION:
${raw_text}

MUST-HAVE QUALIFICATIONS (already extracted):
${JSON.stringify(jdData.must_have_qualifications)}

PREFERRED QUALIFICATIONS:
${JSON.stringify(jdData.preferred_qualifications)}

Your task: produce a holistic fit score. Consider:
- Direct skill matches (exact technologies, tools, languages)
- Transferable experience (related domains, similar tech, comparable scope)
- Seniority alignment (years of experience, scope of responsibility)
- Domain knowledge overlap

Scoring guidance:
- 80–100: Strong match — has most must-have skills plus relevant experience
- 60–79: Good match — has core skills, some gaps in preferred areas
- 40–59: Partial match — some relevant skills, notable gaps in must-haves
- 20–39: Weak match — limited overlap, significant retraining required
- 0–19: Poor match — fundamentally different background

For matching_skills: list skills/tools/technologies from the resume that are explicitly or closely related to the JD requirements.
For missing_skills: list must-have JD requirements absent from the resume.
For gaps: list experience-level or domain gaps (e.g. "No experience leading teams", "No cloud platform exposure").

Return ONLY this JSON, no other text:
{
    "match_score": <0-100>,
    "matching_skills": ["skill1", "skill2"],
    "missing_skills": ["missing1", "missing2"],
    "gaps": ["gap description 1", "gap description 2"]
}`
            }]
        });

        const [inferred, matchMessage] = await Promise.all([miningPromise, matchPromise]);
        const matchResult = parseClaudeJson(matchMessage.content[0].text);

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
                coverage,
                inferred,
                resume_gaps,
                checks: eligibilityChecks
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message, message: 'generateRoutes' });
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

        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 3000,
            messages: [{
                role: 'user',
                content: `This text was scraped from a job-posting web page. It contains page noise: lists of OTHER job openings (title/company/location snippets), navigation, buttons, and UI labels. Exactly ONE job is described in full detail.

Extract that one job. Return ONLY valid JSON, no other text:
{"job_title": "", "company_name": "", "job_description": "", "location": "", "salary": "", "experience_needed": "", "preferred_qualifications": [], "must_have_qualifications": []}

Rules:
- "job_title": the title of the ONE fully-described job
- "company_name": the company hiring for THAT job (not companies from the side lists)
- "job_description": the complete description of THAT job — responsibilities, requirements, qualifications, benefits — preserved VERBATIM from the text. Do not summarize, do not rewrite. Exclude all other job listings, navigation, and UI text.
- "location", "salary", "experience_needed": from THAT job; salary "Not specified" if absent
- "must_have_qualifications" / "preferred_qualifications": THAT job's stated required vs nice-to-have qualifications
- If no fully-described job exists in the text, return the JSON with all fields empty

Scraped page text:
${text}`
            }]
        });

        const parsed = parseClaudeJson(message.content[0].text);
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
        res.status(500).json({ error: err.message, message: 'generateRoutes' });
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
        for (const supp of newSupplements) {
            const content = (supp && supp.content ? String(supp.content) : '').trim();
            if (!content) continue;
            const keyword = supp.keyword ? String(supp.keyword).trim().slice(0, 200) : null;
            await pool.query(
                `INSERT INTO resume_supplements (user_id, resume_id, kind, keyword, content)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (resume_id, md5(content)) DO NOTHING`,
                [user_id, resume_id, supp.kind || 'evidence', keyword, content.slice(0, 2000)]
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
        const tailorMessage = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: `You are an ATS optimization specialist and elite resume writer. Your primary objective is to rewrite this candidate's resume so it scores as high as possible in Applicant Tracking Systems for this specific job, while remaining 100% factually accurate.

Today's date: ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.

${enrichmentBlock}${supplementsBlock}═══════════════════════════════════
CANDIDATE RESUME (source of truth — do not invent anything not here or in the verified blocks above):
═══════════════════════════════════
${resumeRaw}

═══════════════════════════════════
TARGET JOB DESCRIPTION:
═══════════════════════════════════
${jobRow.raw_text}

═══════════════════════════════════
JD REQUIREMENTS (pre-extracted):
═══════════════════════════════════
Must-have: ${JSON.stringify(mustHave)}
Preferred: ${JSON.stringify(preferred)}
Candidate's gaps: ${JSON.stringify(missingSkills)}

═══════════════════════════════════
KEYWORDS TO MIRROR (highest priority — the candidate VERIFIABLY has every term below, from the resume or the verified facts. Each term must appear VERBATIM in the final resume: in the TECHNICAL SKILLS section and, where the source material supports it, in at least one experience/project bullet):
═══════════════════════════════════
${JSON.stringify(candidateHasTerms)}

═══════════════════════════════════
ATS KEYWORD RULES:
═══════════════════════════════════
1. Use the EXACT terminology from the list above — if it says "Node.js" use "Node.js" not "NodeJS"; if it says "CI/CD" use "CI/CD".
2. For important terms, include both the full form and abbreviation on first use: e.g. "Amazon Web Services (AWS)".
3. Mirror the JD's category language in the TECHNICAL SKILLS section (Languages / Frameworks / Cloud / Tools).
4. Every technology from the original resume must still be listed — do not drop anything.
5. Do NOT insert keywords that are NOT in the list above and NOT in the source material — missing skills stay missing.

═══════════════════════════════════
BULLET POINT RULES:
═══════════════════════════════════
- Lead with a strong past-tense action verb: Built, Engineered, Designed, Optimized, Reduced, Increased, Led, Deployed, Architected, Automated, Migrated, Scaled, Implemented, Delivered
- Use XYZ format: "Accomplished [X] as measured by [Y] by doing [Z]"
- Every bullet must include a metric OR a concrete scope indicator (count, %, $, ms, users, team size, request volume)
- If the original resume has no metric for a bullet, reframe with stronger language and scope — do NOT invent numbers
- Weave keywords naturally into bullets — do not stuff them awkwardly
- 2–4 bullets per role, each max 2 lines
- Most relevant bullets first within each role

═══════════════════════════════════
SUMMARY SECTION RULES:
═══════════════════════════════════
- 2–3 sentences maximum
- Name-drop the target role title and 2–3 of the JD's most important must-have skills the candidate has
- Show seniority and impact, not personality traits
- No clichés: "passionate", "detail-oriented", "team player", "results-driven"

═══════════════════════════════════
INTEGRITY RULES (never violate):
═══════════════════════════════════
- Do NOT fabricate companies, titles, durations, projects, technologies, certifications, or metrics
- Do NOT swap or add technologies the candidate did not use. If their resume says .NET, keep .NET
- Do NOT add certifications absent from the original resume and verified facts
- Do NOT address gaps by inventing experience — leave the gap unaddressed
- Content in the USER-VERIFIED and USER-PROVIDED blocks is user-attested truth: use it, exactly as factual as the resume

═══════════════════════════════════
OUTPUT FORMAT — copy this structure EXACTLY. Plain text only. No markdown.
═══════════════════════════════════

[Candidate Full Name]
[Phone] | [Email] | [GitHub: url] | [LinkedIn: url] | [Portfolio: url]

SUMMARY

[2–3 sentence summary. Must name the target role and top 2–3 must-have skills from JD.]

EXPERIENCE

[Company Name] | [Mon YYYY] – [Mon YYYY or Present]
[Job Title]
• [action verb + achievement + metric/scope + keyword woven in]
• [action verb + achievement + metric/scope]

PROJECTS

[Project Name]
Links: GitHub: <url> | Live: <url>
• [What it does + exact technologies + measurable impact]

EDUCATION

[Institution Name] | [Degree, Major] | [Graduation Year]
[GPA: X.X/4.0 — include only if ≥ 3.5]

TECHNICAL SKILLS

Languages: [ALL languages from original resume + verified facts]
Frameworks: [ALL frameworks]
Databases: [ALL databases]
Cloud: [ALL cloud tools/platforms]
Tools: [ALL dev tools, CI/CD, testing, monitoring]
Certifications: [only if present in source material — omit this line if none]

FORMAT RULES:
- Line 1: name only. Line 2: contact with " | " separator. Blank line. Then sections.
- Section headers ALL CAPS, blank line before each.
- Company+date on ONE line: "Company | Mon YYYY – Mon YYYY". Job title on VERY NEXT LINE.
- Blank line between job entries. No blank lines between job title and its bullets.
- Bullets use "•" only.
- No markdown: no **, no ##, no backticks.
- Omit PROJECTS if no projects in source material.
- Aim for 600–750 words — dense but readable.

Return ONLY the resume. No commentary, no preamble, no trailing text.`
            }]
        });

        if (tailorMessage.stop_reason === 'max_tokens') {
            throw new Error('Resume too long — output was cut off. Try a shorter resume.');
        }

        let tailoredResume = tailorMessage.content[0].text.replace(/```json\n?|\n?```/g, '').trim();

        // ── Deterministic score of the tailored output ──────────────────────
        let finalCoverage = matchKeywords(keywords, [{ name: 'resume', text: tailoredResume }]);

        // ── Corrective pass: keywords the candidate HAS but the tailor
        //    dropped. One retry max — enforcement in code, not trust. ────────
        const candidateHasSet = new Set(candidateHasTerms);
        const droppedTerms = finalCoverage.missing
            .filter(m => candidateHasSet.has(m.term))
            .map(m => m.term);

        if (droppedTerms.length > 0) {
            const fixMessage = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4096,
                messages: [{
                    role: 'user',
                    content: `The tailored resume below is missing keywords the candidate verifiably has (they appear in the candidate's source material). Edit the resume so each term below appears VERBATIM — add each to the TECHNICAL SKILLS section and, where the source material supports it, weave into a relevant bullet. Change nothing else. Do not add any term not in this list.

MISSING TERMS (each must appear verbatim):
${JSON.stringify(droppedTerms)}

CANDIDATE SOURCE MATERIAL (for truthful placement):
${resumeRaw}
${suppText ? `\nVERIFIED ADDITIONAL FACTS:\n${suppText}` : ''}

TAILORED RESUME TO FIX:
${tailoredResume}

Return ONLY the complete corrected resume. Plain text, same format, no commentary.`
                }]
            });
            if (fixMessage.stop_reason !== 'max_tokens') {
                const fixed = fixMessage.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
                const fixedCoverage = matchKeywords(keywords, [{ name: 'resume', text: fixed }]);
                // Keep the correction only if it actually improved coverage
                if (fixedCoverage.score >= finalCoverage.score) {
                    tailoredResume = fixed;
                    finalCoverage = fixedCoverage;
                }
            }
        }

        return { tailoredResume, finalCoverage };
        })();

        // ── Cover letter chain (optional, with ground-truth guard) ──────────
        const coverChain = (async () => {
            if (!generate_cover_letter) return null;
            const experienceData = asArray(parsedResumeRow.experience);
            const projectsData   = asArray(parsedResumeRow.projects);

            const techExtractionMessage = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1000,
                messages: [{
                    role: 'user',
                    content: `Extract the exact technologies used in each role and project from this resume data. Return ONLY valid JSON, no other text:
{
  "experience": [{"company": "", "title": "", "technologies": []}],
  "projects": [{"name": "", "technologies": []}]
}

Experience data:
${JSON.stringify(experienceData)}

Projects data:
${JSON.stringify(projectsData)}`
                }]
            });
            const techData = parseClaudeJson(techExtractionMessage.content[0].text);

            const experienceTech = (techData.experience || []).map(exp =>
                `- ${exp.title} at ${exp.company}: ${(exp.technologies || []).join(', ')}`
            ).join('\n');
            const projectTech = (techData.projects || []).map(project =>
                `- ${project.name}: ${(project.technologies || []).join(', ')}`
            ).join('\n');

            const coverMessage = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1500,
                messages: [{
                    role: 'user',
                    content: `You are a world-class career coach writing a cover letter on behalf of a candidate. Your output must read as if a sharp, self-aware human wrote it — not an AI assistant.

Resume:
${resumeRaw}
${suppText ? `\nVERIFIED ADDITIONAL CANDIDATE FACTS:\n${suppText}\n` : ''}
Job Description:
${jobRow.raw_text}

GROUND TRUTH — Technology stack per role (DO NOT deviate from this under any circumstances):
${experienceTech}

GROUND TRUTH — Technology stack per project (DO NOT deviate from this under any circumstances):
${projectTech}

Before writing, extract 4 to 6 high-value keywords or skill phrases from the job description (tools, competencies, outcome types). Weave them into the letter naturally — do not keyword-stuff or list them.

Structure — 4 Short Paragraphs, 200 to 320 words total:

PARAGRAPH 1 — Opening Hook (2 to 3 sentences):
- Do NOT open with "I am writing to apply" or anything similar.
- Open with a specific, verifiable achievement from the resume that directly maps to the role — then tie it immediately to something concrete about THIS company: its mission, a product, a recent launch, or a stated value from the JD.
- The hook should feel like the candidate researched the role, not just the job title.

PARAGRAPH 2 — Strongest Proof Point (3 to 4 sentences):
- Lead with the single most relevant metric or accomplishment from the resume.
- Frame it using PAR structure: what was the problem/context, what action the candidate took, and the measurable result.
- Mirror at least 2 keywords from the JD here naturally.
- When mentioning technologies from professional experience, use ONLY what is listed under GROUND TRUTH for that role.

PARAGRAPH 3 — Supporting Skill or Project (2 to 3 sentences):
- Pick one additional skill, project, or experience that fills a secondary requirement from the JD.
- Include one concrete detail (technology used, scope, outcome).
- Use ONLY the technologies listed under GROUND TRUTH for that specific project.
- Keep it tight — this paragraph supports, not repeats.

PARAGRAPH 4 — Closing (2 sentences max):
- Express enthusiasm for the role specifically (not generically).
- End with a confident, human call-to-action — NOT "I look forward to hearing from you" or "Please find attached."

Voice & Style Rules:
- First person, confident but not arrogant.
- Vary sentence length — mix short punchy sentences with longer ones. Avoid uniform rhythm.
- Allow slight informality where natural — a real human sounds like one.
- No clichés: "hard worker," "team player," "passionate," "excited to apply," "I would be a great fit," "leverage," "utilize," "Please find attached," "synergy," "dynamic," "I look forward to hearing from you."
- Do not repeat resume lines verbatim — expand on context, motivation, and impact.
- Write as if the candidate would read this aloud to a friend — natural, varied, human.

Return ONLY the cover letter body text. No subject line, no greeting header, no sign-off block, no explanation. Start directly with Paragraph 1.`
                }]
            });
            return coverMessage.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
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
        res.status(500).json({ error: err.message, message: 'generateRoutes' });
    }
});

module.exports = router;
// Internal helpers exposed for unit tests only — not part of the route API.
module.exports.__precheck = { durationToMonths, jdRequiredYears, candidateYears, deterministicPrecheck };
