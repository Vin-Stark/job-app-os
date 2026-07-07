const express = require('express');
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');
const { MODELS, callClaude, respondError } = require('../services/claude');
const { RESUME_PARSE_SCHEMA, buildResumeParsePrompt } = require('../services/prompts');
const router = express.Router();

const { aiLimiter } = require('../middleware/rateLimiters');


router.post('/parse/:resumeId', verifyToken, aiLimiter, async (req, res) => {
    try {
        const resume_id = req.params.resumeId;
        const user_Id = req.user.user.id;
        const result_parsed_resume = await pool.query('SELECT * FROM resume_parsed_data WHERE user_id = $1 and resume_id = $2', [user_Id, resume_id]);
        if (result_parsed_resume.rows.length === 0) {
            return res.status(404).json({ error: "Resume not found" });
        }
        const parsedResume = result_parsed_resume.rows[0];
        const { raw_text } = parsedResume;
        if (parsedResume.name) {
            res.json({ success: true, data: parsedResume });
        }
        else {
            const parsedData = await callClaude({
                label: 'resume-parse',
                model: MODELS.EXTRACTION,
                maxTokens: 2500,
                prompt: buildResumeParsePrompt(raw_text),
                schema: RESUME_PARSE_SCHEMA,
            });
            await pool.query(
                `UPDATE resume_parsed_data
SET name=$1, email=$2, phone=$3, summary=$4, skills=$5, experience=$6, education=$7, projects=$8,
    github_url=$9, linkedin_url=$10, portfolio_url=$11
WHERE resume_id=$12 AND user_id=$13`,
                [
                    parsedData.name,
                    parsedData.email,
                    parsedData.phone,
                    parsedData.summary,
                    JSON.stringify(parsedData.skills),
                    JSON.stringify(parsedData.experience),
                    JSON.stringify(parsedData.education),
                    JSON.stringify(parsedData.projects),
                    parsedData.github_url || null,
                    parsedData.linkedin_url || null,
                    parsedData.portfolio_url || null,
                    resume_id,
                    user_Id
                ]
            );

            // Seed resume_projects with any URLs Claude extracted from the resume
            const projectsWithUrls = (parsedData.projects || []).filter(
                p => p.github_url || p.live_url
            );
            for (const proj of projectsWithUrls) {
                await pool.query(
                    `INSERT INTO resume_projects (user_id, resume_id, project_name, github_url, live_url)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (resume_id, project_name)
DO UPDATE SET
  github_url = CASE WHEN EXCLUDED.github_url IS NOT NULL THEN EXCLUDED.github_url ELSE resume_projects.github_url END,
  live_url   = CASE WHEN EXCLUDED.live_url   IS NOT NULL THEN EXCLUDED.live_url   ELSE resume_projects.live_url   END,
  updated_at = NOW()`,
                    [user_Id, resume_id, proj.name, proj.github_url || null, proj.live_url || null]
                );
            }

            // Also seed rows (with NULL urls) for projects that had no URLs, so the gap panel knows they exist
            const projectsWithoutUrls = (parsedData.projects || []).filter(
                p => !p.github_url && !p.live_url
            );
            for (const proj of projectsWithoutUrls) {
                await pool.query(
                    `INSERT INTO resume_projects (user_id, resume_id, project_name)
VALUES ($1, $2, $3)
ON CONFLICT (resume_id, project_name) DO NOTHING`,
                    [user_Id, resume_id, proj.name]
                );
            }

            res.json({ success: true, data: parsedData });
        }

    } catch (err) {
        respondError(res, err, 'parseRoutes', 'Resume parsing failed. Please try again.');
    }
});



router.get('/summary/:resumeId', verifyToken, async (req, res) => {
    try {
        const resume_id = req.params.resumeId;
        const user_id = req.user.user.id;
        const result = await pool.query(
            'SELECT name, summary, skills FROM resume_parsed_data WHERE resume_id = $1 AND user_id = $2',
            [resume_id, user_id]
        );
        if (result.rows.length === 0 || !result.rows[0].name) {
            return res.json({ parsed: false });
        }
        const row = result.rows[0];
        res.json({ parsed: true, name: row.name, summary: row.summary, skills: row.skills });
    } catch (err) {
        respondError(res, err, 'parseRoutes', 'Failed to load resume summary.');
    }
});

module.exports = router;