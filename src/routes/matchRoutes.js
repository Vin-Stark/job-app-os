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

module.exports = router;
