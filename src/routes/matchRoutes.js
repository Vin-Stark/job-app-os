const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

router.post('/match/', verifyToken, async (req, res) => {
    try {
        const { resume_id, job_id } = req.body;
        const user_id = req.user.user.id;
        const resume = await pool.query(`SELECT raw_text FROM resume_parsed_data WHERE user_id = $1 AND resume_id = $2`, [user_id, resume_id]);
        const job = await pool.query(`SELECT raw_text FROM job_descriptions WHERE user_id = $1 AND id = $2`, [user_id, job_id]);
        const prompt = `You are a resume matching agent. Your task is to compare a resume with a job description and determine if the candidate is a good fit for the job.

Resume:
${resume.rows[0].raw_text}

Job Description:
${job.rows[0].raw_text}

Return a JSON response with the following format:
{
    "match_score": <percentage from 0-100>,
    "matching_skills": [],
    "missing_skills": [],
    "gaps": []
}

Strong matches are qualifications listed in the resume that are also present in the job description.
Weak matches are qualifications listed in the resume that are only partially relevant to the job description.
Gaps are qualifications listed in the job description that are missing from the resume.

Return only the JSON, no other text.`
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }]
        });
        const responseText = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
        const parsedData = JSON.parse(responseText);
        await pool.query(`INSERT INTO resume_job_matches (user_id, resume_id, job_id, match_score, matching_skills, missing_skills, gaps) VALUES($1, $2, $3, $4, $5, $6, $7)`, [user_id, resume_id, job_id, parsedData.match_score, JSON.stringify(parsedData.matching_skills), JSON.stringify(parsedData.missing_skills), JSON.stringify(parsedData.gaps)]);
        res.json({ success: true, data: parsedData });


    } catch (err) {
        res.status(500).json({ error: err.message, message: 'matchRoutes' });
    }
});

router.post('/ats/', verifyToken, async (req, res) => {
    try {
        const { resume_id, job_id } = req.body;
        const user_id = req.user.user.id;
        const resume = await pool.query(`SELECT raw_text FROM resume_parsed_data WHERE user_id = $1 AND resume_id = $2`, [user_id, resume_id]);
        const job = await pool.query(`SELECT raw_text FROM job_descriptions WHERE user_id = $1 AND id = $2`, [user_id, job_id]);
        const prompt = `You are an ATS (Applicant Tracking System) scanner. Your job is to perform a strict keyword audit — not a holistic evaluation.

Resume:
${resume.rows[0].raw_text}

Job Description:
${job.rows[0].raw_text}

Instructions:
1. Extract every required skill, technology, tool, and qualification from the job description
2. Check if each one appears explicitly in the resume (exact or near-exact match only)
3. Calculate ats_score as: (matched keywords / total required keywords) * 100

Return only this JSON, no other text:
{
    "ats_score": <number 0-100>,
    "keyword_matches": ["array of keywords found in resume"],
    "keyword_gaps": ["array of keywords missing from resume"]
}`
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }]
        });
        const responseText = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
        const parsedData = JSON.parse(responseText);
        await pool.query(`UPDATE resume_job_matches SET ats_score=$1, keyword_matches=$2, keyword_gaps=$3 WHERE user_id=$4 AND resume_id=$5 AND job_id=$6`, [parsedData.ats_score, JSON.stringify(parsedData.keyword_matches), JSON.stringify(parsedData.keyword_gaps), user_id, resume_id, job_id]);
        res.json({ success: true, data: parsedData });
    }
    catch (err) {
        res.status(500).json({ error: err.message, message: 'matchRoutes' })
    }
});

router.post('/cover-letter/', verifyToken, async (req, res) => {
    try {
        const { resume_id, job_id } = req.body;
        const user_id = req.user.user.id;
        const resume = await pool.query(`SELECT raw_text, experience, projects FROM resume_parsed_data WHERE user_id = $1 AND resume_id = $2`, [user_id, resume_id]);
        const job = await pool.query(`SELECT raw_text FROM job_descriptions WHERE user_id = $1 AND id = $2`, [user_id, job_id]);

        // Step 1: Pre-extract tech stack per role and project
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
${JSON.stringify(resume.rows[0].experience)}

Projects data:
${JSON.stringify(resume.rows[0].projects)}`
            }]
        });

        const techData = JSON.parse(techExtractionMessage.content[0].text.replace(/```json\n?|\n?```/g, '').trim());

        const experienceTech = techData.experience.map(exp =>
            `- ${exp.title} at ${exp.company}: ${exp.technologies.join(', ')}`
        ).join('\n');

        const projectTech = techData.projects.map(project =>
            `- ${project.name}: ${project.technologies.join(', ')}`
        ).join('\n');

        const prompt = `You are a world-class career coach writing a cover letter on behalf of a candidate. Your output must read as if a sharp, self-aware human wrote it — not an AI assistant.

Resume:
${resume.rows[0].raw_text}

Job Description:
${job.rows[0].raw_text}

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

        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }]
        });
        const responseText = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
        await pool.query(`UPDATE resume_job_matches SET cover_letter=$1 WHERE user_id=$2 AND resume_id=$3 AND job_id=$4`, [responseText, user_id, resume_id, job_id]);
        res.json({ success: true, data: responseText });
    } catch (error) {
        res.status(500).json({ error: error.message, message: 'matchRoutes' });
    }
});



router.post('/tailor/', verifyToken, async (req, res) => {
    try {
        const { resume_id, job_id } = req.body;
        const user_id = req.user.user.id;
        const resume = await pool.query(`SELECT raw_text FROM resume_parsed_data WHERE user_id = $1 AND resume_id = $2`, [user_id, resume_id]);
        const job = await pool.query(`SELECT raw_text FROM job_descriptions WHERE user_id = $1 AND id = $2`, [user_id, job_id]);
        const missingSkillOrGaps = await pool.query(`SELECT missing_skills, gaps FROM resume_job_matches WHERE user_id = $1 AND resume_id = $2 AND job_id = $3`, [user_id, resume_id, job_id]);
        const prompt = `You are an elite resume writer and ATS optimization specialist. Your goal is to rewrite this candidate's resume to maximize their chances at top-tier tech companies — while staying 100% truthful to their actual experience.
Today's date is ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
Resume:
${resume.rows[0].raw_text}

Job Description:
${job.rows[0].raw_text}

Missing Skills to Bridge:
${missingSkillOrGaps.rows[0].missing_skills}

Gaps to Address:
${missingSkillOrGaps.rows[0].gaps}

REWRITING RULES:

**ATS Optimization**
- Mirror exact keywords, tools, and technologies from the job description
- Use standard section headers: Summary, Experience, Projects, Skills, Education
- No tables, columns, graphics, or special characters that break ATS parsing
- Group skills clearly: Languages | Frameworks | Tools | Cloud

**Bullet Points — Most Important**
- Every bullet must follow XYZ format: "Accomplished X as measured by Y by doing Z"
- Lead with a strong action verb: Built, Optimized, Designed, Reduced, Increased, Led, Deployed
- Every bullet must include at least one metric (%, ms, users, $, requests/sec, efficiency gain)
- Bad: "Created APIs for user data" → Good: "Built 3 REST APIs to fetch user data from PostgreSQL, reducing average query latency by 40% and supporting 10,000+ daily active users"
- 1-2 lines per bullet max — scannable, not storytelling

**Tailoring**
- Match the company culture implied by the JD (startup = scrappy ownership; MAANG = scale + collaboration; AI firms = model depth + deployment)
- Prioritize experience and projects most relevant to this specific role
- If the JD emphasizes scale, every relevant bullet should mention scale
- If the JD emphasizes ownership, bullets should show end-to-end responsibility

**What NOT to Do**
- Do not fabricate experience, titles, companies, or metrics
- Do not use vague language: "worked on", "helped with", "was involved in"
- Do not write a generic objective statement
- Do not use buzzwords without backing them with results: never say "passionate", "detail-oriented", "team player" without proof
- Do not add certifications that aren't in the original resume
- If the candidate does not have a required skill, do NOT invent experience around it. Instead, find the closest related skill they DO have and reframe it toward the requirement. If there is no related skill, leave that gap unaddressed — do not fabricate.
- Do not swap or replace technologies from the original resume. If the candidate used .NET, do not rewrite it as Node.js. The tech stack in each project and role must match the original resume exactly
- When rewriting project bullets, copy the technology list from the original resume exactly as written. Do not substitute, add, or remove any technology from any project.
- Do not invent metrics that are not present in the original resume. If a bullet has no metric in the original, reframe it with stronger language but do not add a number you cannot verify.

**Structure**
- Keep to 1 page unless candidate has 10+ years of experience
- Professional Summary: 2-3 lines max, tailored to this specific role and company
- Experience: reverse chronological, most relevant bullets first within each role
- Projects: include only if they directly strengthen the application for this role
- Skills: grouped, honest, mirroring JD language
- Education: GPA only if above 3.5, relevant coursework if it strengthens the application


"Return only the rewritten resume text. Use plain text section headers (no # symbols, no bold markdown). No commentary, no explanations.`
        const message = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4000,
            messages: [{ role: 'user', content: prompt }]
        });
        if (message.stop_reason === 'max_tokens') {
            return res.status(500).json({ error: 'Resume too long — output was cut off. Try a shorter resume.' });
        }
        const responseText = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
        await pool.query(`UPDATE resume_job_matches SET tailored_resume=$1 WHERE user_id=$2 AND resume_id=$3 AND job_id=$4`, [responseText, user_id, resume_id, job_id]);
        res.json({ success: true, data: responseText });
    } catch (error) {
        res.status(500).json({ error: error.message, message: 'matchRoutes' });
    }

});

module.exports = router;



