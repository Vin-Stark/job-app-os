// Every Claude prompt and output schema in the backend lives here.
// Design rules for this file (see docs/ai-screening-learnings.md before
// editing any GENERATION prompt):
//   - Every prompt states an explicit no-invention rule: absent data → null /
//     [] / "Not specified", never a guess.
//   - JSON responses are enforced by structured-output schemas (the API
//     guarantees schema-valid JSON), so prompts spend their tokens on field
//     SEMANTICS, not output-format begging.
//   - Generation prompts carry a single priority ladder — truthfulness always
//     outranks keyword coverage, which outranks format, which outranks style.

// ── Resume parse ─────────────────────────────────────────────────────────────

const RESUME_PARSE_SCHEMA = {
    type: 'object',
    properties: {
        name: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        summary: { type: ['string', 'null'] },
        skills: { type: 'array', items: { type: 'string' } },
        experience: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    company: { type: 'string' },
                    title: { type: 'string' },
                    duration: { type: 'string' },
                    technologies: { type: 'array', items: { type: 'string' } },
                    description: { type: 'string' },
                },
                required: ['company', 'title', 'duration', 'technologies', 'description'],
                additionalProperties: false,
            },
        },
        education: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    institution: { type: 'string' },
                    degree: { type: 'string' },
                    year: { type: 'string' },
                },
                required: ['institution', 'degree', 'year'],
                additionalProperties: false,
            },
        },
        projects: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    description: { type: 'string' },
                    technologies: { type: 'array', items: { type: 'string' } },
                    github_url: { type: ['string', 'null'] },
                    live_url: { type: ['string', 'null'] },
                },
                required: ['name', 'description', 'technologies', 'github_url', 'live_url'],
                additionalProperties: false,
            },
        },
        github_url: { type: ['string', 'null'] },
        linkedin_url: { type: ['string', 'null'] },
        portfolio_url: { type: ['string', 'null'] },
    },
    required: ['name', 'email', 'phone', 'summary', 'skills', 'experience', 'education', 'projects', 'github_url', 'linkedin_url', 'portfolio_url'],
    additionalProperties: false,
};

function buildResumeParsePrompt(rawText) {
    return `You are a resume parser. Extract structured data from the resume text below.

EXTRACTION RULES (these outrank everything else):
- Extract ONLY information explicitly present in the text. Never infer, guess, or fabricate a value — returning null or [] is always correct when the data is absent; guessing is always wrong.
- Copy names, technologies, and URLs character-for-character as written. Do not correct spelling, expand abbreviations, or normalize capitalization.
- Never invent a URL. A URL goes in the output only if that exact URL appears in the text.

FIELD RULES:
- "name" / "email" / "phone": exactly as written; null if absent.
- "summary": the resume's own summary/objective text; null if the resume has none — do NOT write one on the candidate's behalf.
- "skills": every distinct skill, technology, and tool listed anywhere in the resume, deduplicated, exact wording.
- "experience" (one entry per role):
  - "duration": when both dates are present, normalize to "Mon YYYY – Mon YYYY" or "Mon YYYY – Present" (e.g. "May 2024 – Present"). If dates are partial or missing, copy exactly what is written.
  - "technologies": ONLY technologies named inside that role's own description/bullets. Do not import them from other roles or from the skills section. [] when none are named.
  - "description": that role's bullets/description condensed into 1–3 factual sentences — no added claims.
- "education": one entry per institution; "year" as written.
- "projects" (one entry per project):
  - "technologies": only technologies named for that specific project.
  - "github_url" / "live_url": only a URL that appears next to or clearly belongs to THAT project; null otherwise.
- "github_url": the GitHub PROFILE URL (github.com/username) — not a repository URL; null if absent.
- "linkedin_url": a linkedin.com/in/... URL; null if absent.
- "portfolio_url": a personal site URL that is NOT GitHub and NOT LinkedIn; null if absent.

Resume text:
${rawText}`;
}

// ── Job-description parse ────────────────────────────────────────────────────

const JD_PARSE_SCHEMA = {
    type: 'object',
    properties: {
        location: { type: 'string' },
        salary: { type: 'string' },
        experience_needed: { type: 'string' },
        preferred_qualifications: { type: 'array', items: { type: 'string' } },
        must_have_qualifications: { type: 'array', items: { type: 'string' } },
    },
    required: ['location', 'salary', 'experience_needed', 'preferred_qualifications', 'must_have_qualifications'],
    additionalProperties: false,
};

function buildJdParsePrompt(rawText) {
    return `You are a job-description parser. Extract structured facts from the job description below.

EXTRACTION RULES (these outrank everything else):
- Extract ONLY what the job description states. Never infer or invent. When a field is absent, use "Not specified" (strings) or [] (arrays) — never guess.
- Keep qualification wording as close to the JD's own words as possible; these strings are shown to the user as the job's actual requirements.

FIELD RULES:
- "location": the work location as stated, including the arrangement when given (e.g. "Remote (US)", "Hybrid – Austin, TX", "On-site – New York, NY"). "Not specified" if absent.
- "salary": the full stated range or amount as one string (e.g. "$120k–$160k", "$180,000/yr + equity"). "Not specified" if absent.
- "experience_needed": the stated experience requirement as one short phrase (e.g. "3+ years backend development"). "Not specified" if absent.
- SECTION HEADINGS OUTRANK ITEM PHRASING: an item under a heading containing "Preferred", "Nice to have", "Bonus", "Plus", or "Desired" (e.g. "Preferred Skills/Experience", "Primary Preferred Skills/Experience", "Secondary Preferred Skills/Experience") is ALWAYS a preferred qualification — even when the item itself says "experience with", "proficiency in", or demands years. Only items under Basic/Minimum/Required-Qualifications-type headings, or framed in body text as "required"/"must"/"need", are must-have.
- "must_have_qualifications": requirements the JD presents as mandatory — items under Basic/Minimum/Required Qualifications or Requirements/Responsibilities headings, or framed with "required", "must", "need", "strong experience in", "proficiency in", or a years-of-experience demand (subject to the heading rule above). One short phrase per item.
- "preferred_qualifications": items framed as "preferred", "nice to have", "a plus", "bonus", "familiarity with", or listed under any Preferred/Bonus-type section (see heading rule).
- A qualification that appears in BOTH a required section and a preferred section goes under must_have only. No duplicates across or within the two lists.

Job description:
${rawText}`;
}

// ── ATS keyword extraction ───────────────────────────────────────────────────

const KEYWORDS_SCHEMA = {
    type: 'object',
    properties: {
        keywords: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    term: { type: 'string' },
                    category: { type: 'string', enum: ['must_have', 'preferred', 'domain'] },
                    aliases: { type: 'array', items: { type: 'string' } },
                },
                required: ['term', 'category', 'aliases'],
                additionalProperties: false,
            },
        },
    },
    required: ['keywords'],
    additionalProperties: false,
};

function buildKeywordsPrompt(rawText) {
    return `You are an ATS keyword extraction engine. From the job description below, enumerate EVERY distinct skill, technology, tool, platform, framework, methodology, certification, and domain term that a keyword-based ATS scanner would check a resume against.

RULES:
- "term": the exact wording used in the JD, preserving its capitalization (e.g. "Node.js", not "node js")
- "category" — rank each keyword by how the JD itself weights it:
  - SECTION HEADINGS OUTRANK ITEM PHRASING: a keyword under a heading containing "Preferred", "Nice to have", "Bonus", "Plus", or "Desired" (e.g. "Preferred Skills/Experience", "Primary Preferred Skills/Experience", "Secondary Preferred Skills/Experience") is ALWAYS "preferred" — even when the item says "experience with", "proficiency in", or demands years
  - "must_have": listed under Basic/Minimum/Required Qualifications or Requirements/Responsibilities headings, or framed in body text with "required", "must", "need", "strong experience in", "proficiency in", years-of-experience demands (subject to the heading rule above)
  - "preferred": framed as "nice to have", "good to have", "preferred", "a plus", "is a plus", "bonus", "extras", "would be great", "familiarity with", or listed under any Preferred/Bonus/Nice-to-have-type section
  - "domain": general industry or role vocabulary that appears in the JD body but is not an explicit requirement (e.g. "SaaS", "B2B", "agile")
- When the same skill appears in BOTH a required section and a preferred section, categorize it "must_have"
- "aliases": up to 4 common abbreviations, full-form expansions, or alternate spellings of the term (e.g. "JavaScript" → ["JS"], "Amazon Web Services" → ["AWS"]). [] when none exist. Aliases are alternate NAMES for the same thing — never related-but-different technologies.
- Include soft-skill keywords only when the JD explicitly states them (e.g. "cross-functional collaboration")
- Do NOT invent terms that are not in the JD — every "term" must appear verbatim somewhere in the text below
- No duplicate terms
- A full JD typically yields 30–80 keywords; a short posting may yield fewer. Never pad the list to hit a count.

Job description:
${rawText}`;
}

// ── Strict eligibility screen (extension flow) ──────────────────────────────

const ELIGIBILITY_SCHEMA = {
    type: 'object',
    properties: {
        checks: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    requirement: { type: 'string' },
                    candidate: { type: 'string' },
                    verdict: { type: 'string', enum: ['pass', 'fail'] },
                    reason: { type: 'string' },
                },
                required: ['name', 'requirement', 'candidate', 'verdict', 'reason'],
                additionalProperties: false,
            },
        },
    },
    required: ['checks'],
    additionalProperties: false,
};

function buildEligibilityPrompt(resumeRaw, jdRaw, today) {
    return `You are a strict job-application eligibility screener. Today's date is ${today}. Compare the CANDIDATE RESUME against the JOB DESCRIPTION and decide, for each hard requirement, whether the candidate is eligible.

Evaluate these dimensions (include a check ONLY when the JD actually states a requirement for it):
- "experience": years / seniority the JD hard-requires vs. what the resume shows
- "graduation_year": if the JD targets a specific grad year / class (e.g. new-grad 2024, or "must graduate by 2025"), compare to the resume's graduation year
- "degree": a hard-required degree/field vs. the resume
- "hard_requirements": other explicit disqualifiers stated as mandatory (e.g. active security clearance, specific license/certification, on-site in a named location with no remote option)

DATE & DURATION RULES (apply BEFORE judging any experience or graduation requirement):
- Anchor ALL date arithmetic to today's date stated above — never to your training data. Resume dates at or beyond your knowledge are normal, not errors.
- "Present" / "Current" in a date range means today. Compute each duration by calendar arithmetic from its start date to today (e.g. "Jan 2020 – Present" with today in June 2023 is ~3 years 5 months).
- Total professional experience = the sum of all role durations, counting overlapping periods once.
- A start date after today has not begun yet (e.g. a degree starting later this year is upcoming, not in progress).
- When a check involves a duration, state the computed value and its date range in "candidate" (e.g. "~2 years 2 months (May 2024 – Present)") so the arithmetic is visible.

RULES:
- Only "fail" when BOTH are true: the JD states the requirement as HARD/REQUIRED, and the resume CLEARLY does not meet it
- SECTION HEADINGS OUTRANK ITEM PHRASING: anything under a heading containing "Preferred", "Nice to have", "Bonus", "Plus", or "Desired" (e.g. "Primary Preferred Skills/Experience") is a preference, NEVER a hard requirement — even when the item states years of experience or says "required"/"must". Do not fail on it and do not create a check for it.
- If the requirement is a preference ("nice to have", "preferred", "a plus") OR the JD is silent OR it is ambiguous OR the resume plausibly meets it → "pass"
- Do NOT invent requirements the JD does not state; every "requirement" value must be traceable to the JD text
- Do NOT invent candidate facts; every "candidate" value must be traceable to the resume (or "not stated in resume")
- "requirement" and "candidate" are short factual phrases; "reason" is one sentence

CANDIDATE RESUME:
${resumeRaw}

JOB DESCRIPTION:
${jdRaw}`;
}

// ── Evidence mining (missing-keyword audit) ─────────────────────────────────

const EVIDENCE_SCHEMA = {
    type: 'object',
    properties: {
        inferred: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    term: { type: 'string' },
                    quote: { type: 'string' },
                },
                required: ['term', 'quote'],
                additionalProperties: false,
            },
        },
        trainable: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    term: { type: 'string' },
                    similar_skill: { type: 'string' },
                },
                required: ['term', 'similar_skill'],
                additionalProperties: false,
            },
        },
    },
    required: ['inferred', 'trainable'],
    additionalProperties: false,
};

function buildEvidenceMiningPrompt(terms, candidateMaterial) {
    return `You are a strict resume evidence auditor. For each keyword below, classify what the candidate's material actually shows about it:

1. "inferred" — the material contains CONCRETE evidence of that exact skill or technology under different wording (e.g. "built REST endpoints with Express" is real evidence of "API development").
2. "trainable" — the material shows NO evidence of the skill itself, but names a SIMILAR tool of the same kind that the candidate does know (e.g. keyword "MySQL" when the material names "PostgreSQL"; keyword "GCP" when the material names "AWS").

RULES for "inferred":
- "quote" must be copied character-for-character from the candidate material (surrounding whitespace aside) — a phrase or bullet, max 250 characters. Quotes are verified in code against the material; a paraphrased quote is discarded.
- Only include a keyword when the material genuinely demonstrates that specific skill. Adjacent or related skills do NOT count as evidence: knowing JavaScript is NOT evidence of TypeScript; using MySQL is NOT evidence of PostgreSQL; using AWS EC2 is NOT evidence of Kubernetes.
- Omit keywords with no real evidence entirely — never include one with an empty or fabricated quote.

RULES for "trainable":
- "similar_skill" must be named VERBATIM somewhere in the candidate material — it is verified in code; entries whose similar_skill the material does not contain are discarded.
- Same kind only: a database for a database, a cloud platform for a cloud platform, a closely related language for a language, a framework for a framework in the same ecosystem. Loose domain adjacency does NOT qualify (knowing Excel is not similar to SQL; knowing Git is not similar to Jenkins).
- A keyword appears in AT MOST one list — when it has real evidence it goes in "inferred", never in "trainable".

SHARED RULES:
- "term" must be copied exactly from the keyword list below.
- If in doubt, leave it out. Omitting is always safer than stretching.

KEYWORDS TO CHECK:
${JSON.stringify(terms)}

CANDIDATE MATERIAL:
${candidateMaterial}`;
}

// ── Holistic fit score ───────────────────────────────────────────────────────

const MATCH_SCHEMA = {
    type: 'object',
    properties: {
        match_score: { type: 'integer' },
        matching_skills: { type: 'array', items: { type: 'string' } },
        missing_skills: { type: 'array', items: { type: 'string' } },
        gaps: { type: 'array', items: { type: 'string' } },
    },
    required: ['match_score', 'matching_skills', 'missing_skills', 'gaps'],
    additionalProperties: false,
};

function buildMatchPrompt({ resumeRaw, suppText, jdRaw, mustHave, preferred, today }) {
    return `You are a senior technical recruiter evaluating candidate fit for a role. Today's date is ${today}. Date ranges ending in "Present" run through today — compute years of experience by calendar arithmetic anchored to this date, never to your training data.

RESUME:
${resumeRaw}
${suppText ? `\nADDITIONAL CANDIDATE FACTS (user-verified — treat as truthfully as the resume):\n${suppText}\n` : ''}
JOB DESCRIPTION:
${jdRaw}

MUST-HAVE QUALIFICATIONS (already extracted):
${JSON.stringify(mustHave)}

PREFERRED QUALIFICATIONS:
${JSON.stringify(preferred)}

Your task: produce a holistic fit score between 0 and 100.

SCORING PROCEDURE (follow these steps in order — the score must be reproducible from them):
Step 1 — MUST-HAVE fraction: for each MUST-HAVE qualification, decide whether the resume (or verified facts) demonstrably meets it. Put the strongest evidence for each met qualification in "matching_skills".
Step 2 — PREFERRED fraction: do the same for the PREFERRED qualifications. When the must-have list is short or generic (e.g. only a degree plus years of experience), the preferred qualifications describe the role's real day-to-day stack — they carry most of the fit signal.
Step 3 — Pick the band below from the two fractions plus seniority alignment (years of experience, scope of responsibility), then choose ONE integer inside the band. Do NOT adjust for writing style, formatting, or enthusiasm — identical facts must always produce the same score.

Scoring bands:
- 95–100: all must-haves + essentially all preferred quals, with matching seniority — near-perfect fit
- 90–94: all must-haves + most preferred quals
- 85–89: all or nearly all must-haves + a solid majority of preferred quals
- 80–84: most must-haves + a meaningful share of preferred quals
- 70–79: core must-haves met; preferred coverage is patchy or seniority is somewhat short
- 60–69: some must-haves missed, or must-haves met with only minor preferred overlap beyond transferable adjacent skills
- 45–59: hard requirements met, but the role's specialist stack (per the preferred quals) is largely absent — the candidate offers transferable adjacent skills, not the named ones
- 30–44: misses some hard requirements AND shows little of the role's stack
- 0–29: misses most hard requirements, seniority is far off, or the background is fundamentally different

GROUNDING RULES (violations make the output worthless):
- Every "matching_skills" item must actually appear in the resume or the verified facts — never list a skill the candidate does not show.
- Every "missing_skills" item must actually appear in the JD's requirements — never invent a requirement.
- "gaps" are experience-level or domain gaps (e.g. "No experience leading teams", "No cloud platform exposure"), each grounded in a real JD expectation the resume does not meet.
- Maximum 15 items per array — keep the most significant.
- match_score must be an integer consistent with the scoring guidance above.`;
}

// ── Extension: job extraction from a messy page scrape ──────────────────────

const EXTRACT_JOB_SCHEMA = {
    type: 'object',
    properties: {
        job_title: { type: 'string' },
        company_name: { type: 'string' },
        job_description: { type: 'string' },
        location: { type: 'string' },
        salary: { type: 'string' },
        experience_needed: { type: 'string' },
        preferred_qualifications: { type: 'array', items: { type: 'string' } },
        must_have_qualifications: { type: 'array', items: { type: 'string' } },
    },
    required: ['job_title', 'company_name', 'job_description', 'location', 'salary', 'experience_needed', 'preferred_qualifications', 'must_have_qualifications'],
    additionalProperties: false,
};

function buildExtractJobPrompt(text) {
    return `This text was scraped from a job-posting web page. It contains page noise: lists of OTHER job openings (title/company/location snippets), navigation, buttons, and UI labels. Exactly ONE job is described in full detail.

Extract that one job.

RULES:
- "job_title": the title of the ONE fully-described job
- "company_name": the company hiring for THAT job (not companies from the side lists)
- "job_description": the complete description of THAT job — responsibilities, requirements, qualifications, benefits — preserved VERBATIM from the text. Do not summarize, do not rewrite, do not add words that are not in the source. Exclude all other job listings, navigation, and UI text.
- "location", "salary", "experience_needed": from THAT job only; use "Not specified" when absent
- "must_have_qualifications" / "preferred_qualifications": THAT job's stated required vs nice-to-have qualifications, in the JD's own wording. SECTION HEADINGS OUTRANK ITEM PHRASING: an item under a heading containing "Preferred", "Nice to have", "Bonus", "Plus", or "Desired" (e.g. "Primary Preferred Skills/Experience") is ALWAYS preferred, even when the item says "experience with"/"proficiency in" or demands years; only Basic/Minimum/Required-Qualifications-type headings or explicit "required"/"must" framing yield must-have
- Never fill a field from general knowledge or from the other listings on the page — only from THAT job's own text
- If no fully-described job exists in the text, return every string field as "" and every array as []

Scraped page text:
${text}`;
}

// ── Tech ground-truth extraction (fallback for resumes parsed before
//    experience[].technologies existed in the parse schema) ─────────────────

const TECH_EXTRACTION_SCHEMA = {
    type: 'object',
    properties: {
        experience: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    company: { type: 'string' },
                    title: { type: 'string' },
                    technologies: { type: 'array', items: { type: 'string' } },
                },
                required: ['company', 'title', 'technologies'],
                additionalProperties: false,
            },
        },
        projects: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    name: { type: 'string' },
                    technologies: { type: 'array', items: { type: 'string' } },
                },
                required: ['name', 'technologies'],
                additionalProperties: false,
            },
        },
    },
    required: ['experience', 'projects'],
    additionalProperties: false,
};

function buildTechExtractionPrompt(experienceData, projectsData) {
    return `Extract the exact technologies used in each role and project from this resume data.

RULES:
- List ONLY technologies explicitly named in that specific role's or project's own data. Never import a technology from a different role, a different project, or general knowledge.
- Copy each technology name exactly as written.
- [] when a role or project names no technologies — never guess.

Experience data:
${JSON.stringify(experienceData)}

Projects data:
${JSON.stringify(projectsData)}`;
}

// ── GENERATION: tailored resume ──────────────────────────────────────────────
// Prompt design constraints come from docs/ai-screening-learnings.md:
// extractor-friendly headings and dates, every project linked, open-source
// contributions distinct from personal repos, no generic renames, no
// GPA/prestige-led content, complexity-forward but TRUE descriptions.

function buildTailorPrompt({ enrichmentBlock, supplementsBlock, resumeRaw, jdRaw, mustHave, preferred, missingSkills, candidateHasTerms, today }) {
    return `You are an ATS optimization specialist and elite resume writer. Rewrite this candidate's resume so it scores as high as possible in Applicant Tracking Systems and AI resume screeners for this specific job, while remaining 100% factually accurate.

Today's date: ${today}. Date ranges ending in "Present" run through today — any years-of-experience figure in the summary or bullets must be computed from this date.

PRIORITY ORDER — when any two rules conflict, the HIGHER rule always wins:
1. TRUTHFULNESS (integrity rules)
2. KEYWORD MIRRORING (ATS rules)
3. OUTPUT FORMAT
4. Bullet & summary style

${enrichmentBlock}${supplementsBlock}═══════════════════════════════════
CANDIDATE RESUME (source of truth — nothing may appear in the output that is not here or in the verified blocks above):
═══════════════════════════════════
${resumeRaw}

═══════════════════════════════════
TARGET JOB DESCRIPTION:
═══════════════════════════════════
${jdRaw}

═══════════════════════════════════
JD REQUIREMENTS (pre-extracted):
═══════════════════════════════════
Must-have: ${JSON.stringify(mustHave)}
Preferred: ${JSON.stringify(preferred)}
Candidate's gaps: ${JSON.stringify(missingSkills)}

═══════════════════════════════════
KEYWORDS TO MIRROR (the candidate VERIFIABLY has every term below — each comes from the resume or the verified facts. Each term must appear VERBATIM in the final resume: in TECHNICAL SKILLS and, where the source material supports it, in at least one experience/project bullet):
═══════════════════════════════════
${JSON.stringify(candidateHasTerms)}

═══════════════════════════════════
1. INTEGRITY RULES (highest priority — never violated for any reason):
═══════════════════════════════════
- Do NOT fabricate companies, titles, durations, projects, technologies, certifications, URLs, or metrics
- Do NOT swap or add technologies the candidate did not use. If their resume says .NET, keep .NET — never rewrite it as Node.js
- Do NOT invent numbers. If a bullet has no metric in the source, reframe it with stronger language and concrete scope — but never add a figure the source does not contain
- Do NOT add certifications absent from the source material
- Do NOT address a gap by inventing experience — a real gap stays unaddressed
- Do NOT rename projects. Keep each project's real name exactly as the candidate wrote it
- Do NOT insert keywords that are absent from both the KEYWORDS TO MIRROR list and the source material — missing skills stay missing
- Content in the USER-VERIFIED and USER-PROVIDED blocks is user-attested truth: use it, exactly as factual as the resume

═══════════════════════════════════
2. ATS KEYWORD RULES:
═══════════════════════════════════
- Use the EXACT terminology from KEYWORDS TO MIRROR — if it says "Node.js" write "Node.js" not "NodeJS"; if it says "CI/CD" write "CI/CD"
- For important terms, include full form and abbreviation on first use: "Amazon Web Services (AWS)"
- Mirror the JD's category language in TECHNICAL SKILLS (Languages / Frameworks / Databases / Cloud / Tools)
- Every technology from the original resume must still be listed — drop nothing
- Weave keywords into bullets naturally — never stuff them

═══════════════════════════════════
3. OUTPUT FORMAT — copy this structure EXACTLY. Plain text only. No markdown.
═══════════════════════════════════

[Candidate Full Name]
[Phone] | [Email] | [GitHub: url] | [LinkedIn: url] | [Portfolio: url]

SUMMARY

[2–3 sentence summary. Must name the target role and the top 2–3 must-have skills from the JD that the candidate actually has. Technical evidence only — never lead with GPA, school prestige, or location; AI screeners ignore those by design.]

EXPERIENCE

[Company Name] | [Mon YYYY] – [Mon YYYY or Present]
[Job Title]
• [action verb + achievement + metric/scope + keyword woven in]
• [action verb + achievement + metric/scope]

PROJECTS

[Project Name]
Links: GitHub: <url> | Live: <url>
• [What it does + exact technologies + true complexity signals (auth, database, real-time, scale, users, ML) + measurable impact when the source has one]

[If the enrichment block includes OPEN SOURCE CONTRIBUTIONS, add an "Open Source" subsection here — contributions to external repositories are scored separately from personal projects by AI screeners, so label them explicitly ("Contributed X to <project>")]

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
- Section headers ALL CAPS, blank line before each — standard headers only, no creative renames (AI screeners parse by heading)
- Dates always "Mon YYYY – Mon YYYY" or "Mon YYYY – Present" — nothing exotic
- Company+date on ONE line: "Company | Mon YYYY – Mon YYYY". Job title on the VERY NEXT line
- Blank line between job entries. No blank lines between a job title and its bullets
- Bullets use "•" only. No markdown: no **, no ##, no backticks. No tables or columns
- Include the "Links:" line for every project that has a URL in the enrichment block. Never invent a URL for a project that has none
- Omit PROJECTS if the source material has no projects

═══════════════════════════════════
4. BULLET & SUMMARY STYLE:
═══════════════════════════════════
- Lead every bullet with a strong past-tense action verb: Built, Engineered, Designed, Optimized, Reduced, Increased, Led, Deployed, Architected, Automated, Migrated, Scaled, Implemented, Delivered
- XYZ format: "Accomplished [X] as measured by [Y] by doing [Z]"
- Every bullet carries a metric OR a concrete scope indicator (count, %, $, ms, users, team size, request volume) — sourced, never invented
- 2–4 bullets per role, each max 2 lines, most relevant first
- No clichés anywhere: "passionate", "detail-oriented", "team player", "results-driven"
- Fewer, stronger projects beat many weak ones: if the source has more projects than fit, keep the ones most relevant to this JD with the strongest complexity signals
- Length: aim for 600–750 words. If everything relevant will not fit, cut the least relevant projects and bullets first — NEVER meet the length by dropping terms from KEYWORDS TO MIRROR or by compressing the contact/links lines

Return ONLY the resume. No commentary, no preamble, no trailing text.`;
}

// ── GENERATION: corrective pass (dropped-keyword fix) ────────────────────────

function buildTailorFixPrompt({ droppedTerms, resumeRaw, suppText, tailoredResume }) {
    return `The tailored resume below is missing keywords the candidate verifiably has (each appears in the candidate's source material). Edit the resume so every term below appears VERBATIM — add each to the TECHNICAL SKILLS section and, where the source material genuinely supports it, weave it into one relevant bullet.

RULES:
- Change NOTHING else: do not reword, reorder, or delete any other content
- Do not add any term that is not in the MISSING TERMS list
- Placement must be truthful — a term may only be attached to a role/project whose source material actually involves it; otherwise it goes in TECHNICAL SKILLS only
- Keep the exact same plain-text format

MISSING TERMS (each must appear verbatim):
${JSON.stringify(droppedTerms)}

CANDIDATE SOURCE MATERIAL (for truthful placement):
${resumeRaw}
${suppText ? `\nVERIFIED ADDITIONAL FACTS:\n${suppText}` : ''}

TAILORED RESUME TO FIX:
${tailoredResume}

Return ONLY the complete corrected resume. Plain text, same format, no commentary.`;
}

// ── GENERATION: cover letter ─────────────────────────────────────────────────

function buildCoverLetterPrompt({ resumeRaw, suppText, jdRaw, experienceTech, projectTech, today }) {
    return `You are a world-class career coach writing a cover letter on behalf of a candidate. Your output must read as if a sharp, self-aware human wrote it — not an AI assistant. Today's date is ${today}.

Resume:
${resumeRaw}
${suppText ? `\nVERIFIED ADDITIONAL CANDIDATE FACTS:\n${suppText}\n` : ''}
Job Description:
${jdRaw}

GROUND TRUTH — Technology stack per role (DO NOT deviate from this under any circumstances):
${experienceTech}

GROUND TRUTH — Technology stack per project (DO NOT deviate from this under any circumstances):
${projectTech}

TRUTH RULES (highest priority — they outrank every style rule below):
- Everything you say about the company must come from the JOB DESCRIPTION text itself. You have NO other knowledge of this company: never reference products, launches, news, funding, culture, or mission statements that the JD does not state.
- Every claim about the candidate must be verifiable from the resume or the verified facts. No unverifiable superlatives ("best", "world-class", "top 1%") and no invented metrics.
- Any duration you state ("two years at X") must be computed from the resume's date ranges anchored to today's date above — "Present" means today, not the edge of your training data.
- When mentioning technologies, use ONLY what the GROUND TRUTH lists for that specific role or project.

Before writing, extract 4 to 6 high-value keywords or skill phrases from the job description (tools, competencies, outcome types). Weave them into the letter naturally — do not keyword-stuff or list them.

Structure — 4 Short Paragraphs, 200 to 320 words total:

PARAGRAPH 1 — Opening Hook (2 to 3 sentences):
- Do NOT open with "I am writing to apply" or anything similar.
- Open with a specific, verifiable achievement from the resume that directly maps to the role — then tie it immediately to something concrete the JD itself says about the company or the role: its stated mission, the team's stated goals, a named product or responsibility from the posting.
- The hook should feel like the candidate read the posting carefully — grounded in the JD, not in imagined company facts.

PARAGRAPH 2 — Strongest Proof Point (3 to 4 sentences):
- Lead with the single most relevant metric or accomplishment from the resume.
- Frame it using PAR structure: what was the problem/context, what action the candidate took, and the measurable result.
- Mirror at least 2 keywords from the JD here naturally.

PARAGRAPH 3 — Supporting Skill or Project (2 to 3 sentences):
- Pick one additional skill, project, or experience that fills a secondary requirement from the JD.
- Include one concrete detail (technology used, scope, outcome) — favor true complexity signals (auth, databases, real-time, scale, real users) over adjectives.
- Keep it tight — this paragraph supports, not repeats.

PARAGRAPH 4 — Closing (2 sentences max):
- Express enthusiasm for the role specifically (not generically), grounded in what the JD says the role involves.
- End with a confident, human call-to-action — NOT "I look forward to hearing from you" or "Please find attached."

Voice & Style Rules:
- First person, confident but not arrogant.
- Vary sentence length — mix short punchy sentences with longer ones. Avoid uniform rhythm.
- Allow slight informality where natural — a real human sounds like one.
- No clichés: "hard worker," "team player," "passionate," "excited to apply," "I would be a great fit," "leverage," "utilize," "Please find attached," "synergy," "dynamic," "I look forward to hearing from you."
- Do not repeat resume lines verbatim — expand on context, motivation, and impact.
- Write as if the candidate would read this aloud to a friend — natural, varied, human.

Return ONLY the cover letter body text. No subject line, no greeting header, no sign-off block, no explanation. Start directly with Paragraph 1.`;
}

module.exports = {
    RESUME_PARSE_SCHEMA, buildResumeParsePrompt,
    JD_PARSE_SCHEMA, buildJdParsePrompt,
    KEYWORDS_SCHEMA, buildKeywordsPrompt,
    ELIGIBILITY_SCHEMA, buildEligibilityPrompt,
    EVIDENCE_SCHEMA, buildEvidenceMiningPrompt,
    MATCH_SCHEMA, buildMatchPrompt,
    EXTRACT_JOB_SCHEMA, buildExtractJobPrompt,
    TECH_EXTRACTION_SCHEMA, buildTechExtractionPrompt,
    buildTailorPrompt,
    buildTailorFixPrompt,
    buildCoverLetterPrompt,
};
