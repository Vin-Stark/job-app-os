const express = require('express');
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');

const router = express.Router();

// JSONB columns come back from `pg` already parsed. Guard against double-parsing.
function asArray(val) {
    if (val == null) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return []; }
}

// GET /api/links/:resumeId
// Returns stored social links and per-project links for the resume
router.get('/:resumeId', verifyToken, async (req, res) => {
    try {
        const resume_id = req.params.resumeId;
        const user_id = req.user.user.id;

        const resumeResult = await pool.query(
            `SELECT github_url, linkedin_url, portfolio_url, open_source_notes, projects
             FROM resume_parsed_data
             WHERE resume_id = $1 AND user_id = $2`,
            [resume_id, user_id]
        );
        if (resumeResult.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found', message: 'linksRoutes' });
        }
        const row = resumeResult.rows[0];

        // Fetch per-project link rows
        const projectsResult = await pool.query(
            `SELECT project_name, github_url, live_url
             FROM resume_projects
             WHERE resume_id = $1 AND user_id = $2
             ORDER BY id ASC`,
            [resume_id, user_id]
        );

        // Merge: use resume_projects rows as source of truth for links,
        // but fill in any projects from parsed_data not yet in resume_projects
        const existingNames = new Set(projectsResult.rows.map(r => r.project_name));
        const parsedProjects = asArray(row.projects);
        const extraRows = parsedProjects
            .filter(p => !existingNames.has(p.name))
            .map(p => ({ project_name: p.name, github_url: null, live_url: null }));

        const allProjects = [...projectsResult.rows, ...extraRows];

        res.json({
            success: true,
            social: {
                github_url:         row.github_url         || null,
                linkedin_url:       row.linkedin_url       || null,
                portfolio_url:      row.portfolio_url      || null,
                open_source_notes:  row.open_source_notes  || null,
            },
            projects: allProjects,
        });
    } catch (err) {
        res.status(500).json({ error: err.message, message: 'linksRoutes' });
    }
});

// PUT /api/links/:resumeId
// Saves social links and per-project links to DB
router.put('/:resumeId', verifyToken, async (req, res) => {
    try {
        const resume_id = req.params.resumeId;
        const user_id = req.user.user.id;
        const { social = {}, projects = [], open_source_notes = null } = req.body;

        // Verify ownership
        const check = await pool.query(
            'SELECT resume_id FROM resume_parsed_data WHERE resume_id = $1 AND user_id = $2',
            [resume_id, user_id]
        );
        if (check.rows.length === 0) {
            return res.status(404).json({ error: 'Resume not found', message: 'linksRoutes' });
        }

        // Update social links
        await pool.query(
            `UPDATE resume_parsed_data
             SET github_url=$1, linkedin_url=$2, portfolio_url=$3, open_source_notes=$4
             WHERE resume_id=$5 AND user_id=$6`,
            [
                social.github_url    || null,
                social.linkedin_url  || null,
                social.portfolio_url || null,
                open_source_notes    || null,
                resume_id,
                user_id,
            ]
        );

        // Upsert each project row
        for (const proj of projects) {
            if (!proj.project_name) continue;
            await pool.query(
                `INSERT INTO resume_projects (user_id, resume_id, project_name, github_url, live_url)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (resume_id, project_name)
DO UPDATE SET
  github_url = EXCLUDED.github_url,
  live_url   = EXCLUDED.live_url,
  updated_at = NOW()`,
                [user_id, resume_id, proj.project_name, proj.github_url || null, proj.live_url || null]
            );
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message, message: 'linksRoutes' });
    }
});

module.exports = router;
