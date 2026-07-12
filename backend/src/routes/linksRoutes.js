const express = require('express');
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');
const { respondError } = require('../services/claude');

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
        respondError(res, err, 'linksRoutes', 'Failed to load links.');
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

        // Upsert all project rows in one batch
        const validProjects = projects.filter(p => p.project_name);
        if (validProjects.length > 0) {
            await pool.query(
                `INSERT INTO resume_projects (user_id, resume_id, project_name, github_url, live_url)
SELECT $1, $2, UNNEST($3::text[]), UNNEST($4::text[]), UNNEST($5::text[])
ON CONFLICT (resume_id, project_name)
DO UPDATE SET
  github_url = EXCLUDED.github_url,
  live_url   = EXCLUDED.live_url,
  updated_at = NOW()`,
                [user_id, resume_id,
                 validProjects.map(p => p.project_name),
                 validProjects.map(p => p.github_url || null),
                 validProjects.map(p => p.live_url   || null)]
            );
        }

        res.json({ success: true });
    } catch (err) {
        respondError(res, err, 'linksRoutes', 'Failed to save links.');
    }
});

module.exports = router;
