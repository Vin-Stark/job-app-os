// One-off verification harness for the Claude service refactor.
// Exercises every schema + prompt against the live API with small synthetic
// inputs, asserting shape and grounding. Run: node scripts/verify-claude-service.js
require('dotenv').config();
const { MODELS, callClaude } = require('../src/services/claude');
const P = require('../src/services/prompts');

const RESUME = `Vinson Test
vinson@test.com | 555-0100 | github.com/vinsontest | linkedin.com/in/vinsontest

SUMMARY
Full-stack engineer focused on Node.js backends.

EXPERIENCE
Acme Corp | May 2024 – Present
Software Engineer
- Built REST APIs with Node.js, Express and PostgreSQL serving 10,000 daily users
- Reduced query latency 40% by adding connection pooling

PROJECTS
CareerOS (github.com/vinsontest/careeros)
- AI job application platform using React, Express, PostgreSQL and AWS S3

EDUCATION
State University | BS Computer Science | 2024

SKILLS
JavaScript, Node.js, Express, React, PostgreSQL, AWS S3, Git`;

const JD = `Backend Engineer — DataFlow Inc (Remote, US)
$140,000 - $170,000/yr

We build data pipelines for B2B SaaS customers.

Requirements:
- 2+ years of backend development experience
- Strong proficiency in Node.js and PostgreSQL
- Experience building REST APIs
- Bachelor's degree in CS or related field required

Nice to have:
- Familiarity with TypeScript
- AWS experience is a plus`;

const SCRAPE = `Jobs you may like: Frontend Dev - PixelCo - NYC | Data Analyst - NumCo - Austin
Sign in  Home  Notifications
${JD}
Apply now  Save  Share  About the company  1,234 followers`;

function ok(name, cond, extra = '') {
    console.log(`${cond ? '  ✅' : '  ❌ FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
    if (!cond) process.exitCode = 1;
}

(async () => {
    console.log('— resume-parse (Haiku, schema) —');
    const r = await callClaude({ label: 'resume-parse', model: MODELS.EXTRACTION, maxTokens: 2500, prompt: P.buildResumeParsePrompt(RESUME), schema: P.RESUME_PARSE_SCHEMA });
    ok('name extracted', r.name === 'Vinson Test', r.name);
    ok('experience[].technologies is array', Array.isArray(r.experience[0].technologies), JSON.stringify(r.experience[0].technologies));
    ok('role tech only from role bullets (no React)', !r.experience[0].technologies.includes('React'));
    ok('duration normalized', /May 2024 – Present/.test(r.experience[0].duration), r.experience[0].duration);
    ok('project github_url exact', r.projects[0].github_url === 'github.com/vinsontest/careeros' || (r.projects[0].github_url || '').includes('github.com/vinsontest/careeros'), r.projects[0].github_url);
    ok('portfolio_url null (absent)', r.portfolio_url === null, String(r.portfolio_url));

    console.log('— jd-parse (Haiku, schema) —');
    const j = await callClaude({ label: 'jd-parse', model: MODELS.EXTRACTION, maxTokens: 1500, prompt: P.buildJdParsePrompt(JD), schema: P.JD_PARSE_SCHEMA });
    ok('salary captured', j.salary.includes('140'), j.salary);
    ok('location includes remote', /remote/i.test(j.location), j.location);
    ok('must_have populated', j.must_have_qualifications.length >= 3, String(j.must_have_qualifications.length));
    ok('TypeScript in preferred not must', j.preferred_qualifications.some(q => /typescript/i.test(q)) && !j.must_have_qualifications.some(q => /typescript/i.test(q)));

    console.log('— keywords (Haiku, schema) —');
    const k = await callClaude({ label: 'keywords', model: MODELS.EXTRACTION, maxTokens: 4000, prompt: P.buildKeywordsPrompt(JD), schema: P.KEYWORDS_SCHEMA });
    ok('keywords extracted', k.keywords.length >= 5, `${k.keywords.length} terms`);
    ok('categories valid', k.keywords.every(x => ['must_have', 'preferred', 'domain'].includes(x.category)));
    ok('no invented terms (spot: every term substring-ish of JD)', k.keywords.filter(x => !JD.toLowerCase().includes(x.term.toLowerCase())).length <= 2);

    console.log('— eligibility (Haiku, schema) —');
    const e = await callClaude({ label: 'eligibility', model: MODELS.EXTRACTION, maxTokens: 1200, prompt: P.buildEligibilityPrompt(RESUME, JD), schema: P.ELIGIBILITY_SCHEMA });
    ok('checks returned', Array.isArray(e.checks) && e.checks.length > 0, `${e.checks.length} checks`);
    ok('verdicts valid', e.checks.every(c => ['pass', 'fail'].includes(c.verdict)));

    console.log('— evidence-mining (Haiku, schema) —');
    const m = await callClaude({ label: 'evidence-mining', model: MODELS.EXTRACTION, maxTokens: 2000, prompt: P.buildEvidenceMiningPrompt(['API development', 'TypeScript'], RESUME), schema: P.EVIDENCE_SCHEMA });
    ok('no TypeScript stretch (JS ≠ TS)', !m.inferred.some(i => i.term === 'TypeScript'), JSON.stringify(m.inferred.map(i => i.term)));
    ok('quotes verbatim', m.inferred.every(i => RESUME.toLowerCase().includes(i.quote.toLowerCase().slice(0, 50))));

    console.log('— holistic-match (Haiku, schema) —');
    const h = await callClaude({ label: 'holistic-match', model: MODELS.EXTRACTION, maxTokens: 1500, prompt: P.buildMatchPrompt({ resumeRaw: RESUME, suppText: '', jdRaw: JD, mustHave: j.must_have_qualifications, preferred: j.preferred_qualifications }), schema: P.MATCH_SCHEMA });
    ok('integer score 0-100', Number.isInteger(h.match_score) && h.match_score >= 0 && h.match_score <= 100, String(h.match_score));
    ok('arrays capped ≤15', [h.matching_skills, h.missing_skills, h.gaps].every(a => a.length <= 15));

    console.log('— extract-job (Haiku, schema) —');
    const x = await callClaude({ label: 'extract-job', model: MODELS.EXTRACTION, maxTokens: 5000, prompt: P.buildExtractJobPrompt(SCRAPE), schema: P.EXTRACT_JOB_SCHEMA });
    ok('company correct (not side-list)', x.company_name.includes('DataFlow'), x.company_name);
    ok('noise excluded', !x.job_description.includes('PixelCo') && !x.job_description.includes('Apply now'));
    ok('JD preserved', x.job_description.length > 200, `${x.job_description.length} chars`);

    console.log('— tailor (SONNET, text) —');
    const t = await callClaude({
        label: 'tailor', model: MODELS.GENERATION, maxTokens: 4096,
        prompt: P.buildTailorPrompt({
            enrichmentBlock: '', supplementsBlock: '', resumeRaw: RESUME, jdRaw: JD,
            mustHave: j.must_have_qualifications, preferred: j.preferred_qualifications,
            missingSkills: ['TypeScript'], candidateHasTerms: ['Node.js', 'PostgreSQL', 'REST APIs', 'Express', 'AWS'],
            today: 'July 2026',
        }),
    });
    ok('plain text (no markdown)', !t.includes('**') && !t.includes('##'));
    ok('keywords mirrored', ['Node.js', 'PostgreSQL', 'Express'].every(term => t.includes(term)));
    ok('no fabricated TypeScript', !t.includes('TypeScript'), 'gap stayed a gap');
    ok('sections present', ['SUMMARY', 'EXPERIENCE', 'TECHNICAL SKILLS'].every(s => t.includes(s)));

    console.log('— cover-letter (SONNET, text) —');
    const c = await callClaude({
        label: 'cover-letter', model: MODELS.GENERATION, maxTokens: 1500,
        prompt: P.buildCoverLetterPrompt({
            resumeRaw: RESUME, suppText: '', jdRaw: JD,
            experienceTech: '- Software Engineer at Acme Corp: Node.js, Express, PostgreSQL',
            projectTech: '- CareerOS: React, Express, PostgreSQL, AWS S3',
        }),
    });
    const words = c.split(/\s+/).length;
    ok('word count sane', words >= 150 && words <= 400, `${words} words`);
    ok('no banned openers', !/^I am writing to apply/i.test(c));
    ok('no invented company facts (no "launch/funding/founded")', !/recent launch|series [a-z]|founded in|headquartered/i.test(c));

    console.log('\nDone.');
})().catch(err => { console.error('HARNESS FAILURE:', err); process.exit(1); });
