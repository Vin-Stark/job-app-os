const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');

router.post('/', verifyToken, async (req, res) => {
    try {
        const { resume_id, job_id, job_url, notes } = req.body;
        const result_jobs = await pool.query(
            `SELECT id FROM job_descriptions WHERE id = $1 AND user_id = $2`,
            [job_id, req.user.user.id]
        );
        if (result_jobs.rows.length === 0) {
            return res.status(404).json({ error: 'Job not found', message: 'applicationRoutes post' });
        }
        // Ownership check on resume_id too — every id from the body must be
        // verified against the caller before it lands in an INSERT
        if (resume_id != null) {
            const result_resume = await pool.query(
                `SELECT id FROM resumes WHERE id = $1 AND user_id = $2`,
                [resume_id, req.user.user.id]
            );
            if (result_resume.rows.length === 0) {
                return res.status(404).json({ error: 'Resume not found', message: 'applicationRoutes post' });
            }
        }
        const application = await pool.query(
            `INSERT INTO job_applications (user_id, resume_id, job_id, job_url, notes)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.user.user.id, resume_id, job_id, job_url, notes]
        );
        res.json({ success: true, data: application.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save application.', message: 'applicationRoutes post' });
    }
});

router.get('/', verifyToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                ja.id, ja.status, ja.applied_date, ja.job_url,
                ja.notes, ja.created_at, ja.job_id, ja.resume_id,
                jd.company_name, jd.job_title, jd.location, jd.salary
            FROM job_applications ja
            LEFT JOIN job_descriptions jd ON ja.job_id = jd.id
            WHERE ja.user_id = $1
            ORDER BY ja.applied_date DESC, ja.created_at DESC`,
            [req.user.user.id]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load applications.', message: 'applicationRoutes get' });
    }
});

router.patch('/:id', verifyToken, async (req, res) => {
    try {
        const allowed = ['status', 'notes', 'job_url'];
        const fields = [];
        const values = [];
        let idx = 1;

        for (const key of allowed) {
            if (req.body[key] !== undefined) {
                fields.push(`${key} = $${idx++}`);
                values.push(req.body[key]);
            }
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No updatable fields provided', message: 'applicationRoutes patch' });
        }

        values.push(req.params.id, req.user.user.id);
        const application = await pool.query(
            `UPDATE job_applications SET ${fields.join(', ')}
             WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
            values
        );

        if (application.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found', message: 'applicationRoutes patch' });
        }

        res.json({ success: true, data: application.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update application.', message: 'applicationRoutes patch' });
    }
});

router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const application = await pool.query(
            `DELETE FROM job_applications WHERE id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.user.user.id]
        );
        if (application.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found', message: 'applicationRoutes delete' });
        }
        res.json({ success: true, data: application.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete application.', message: 'applicationRoutes delete' });
    }
});

module.exports = router;
