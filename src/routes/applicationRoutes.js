const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');

router.post('/', verifyToken, async (req, res) => {
    try {
        const { resume_id, job_id, job_url, notes } = req.body;
        const result_jobs = await pool.query(`SELECT * FROM job_descriptions WHERE id = $1 AND user_id = $2`, [job_id, req.user.user.id])
        if (result_jobs.rows.length === 0) {
            return res.status(404).json({ error: "Job not found" });
        }
        const application = await pool.query(`
            INSERT INTO job_applications 
            (user_id, resume_id, job_id, job_url, notes) 
            VALUES($1, $2, $3, $4, $5)
            RETURNING *`, 
            [req.user.user.id, resume_id, job_id, job_url, notes]);
        res.json({ success: true, data: application.rows[0] });
    }
    catch (err) {
        res.json({error:err.message,message:'applicationRoutes'})
    }
});

router.get('/', verifyToken, async (req, res) => {
    try {
        const application = await pool.query(`
            SELECT * FROM job_applications 
            WHERE user_id = $1 `, 
            [req.user.user.id]);
        res.json({ success: true, data: application.rows });
    } catch (error) {
        res.json({ error: error.message, message: 'applicationRoutes get' });
    }
});

router.patch('/:id', verifyToken, async (req, res) => {
    try {
        const { status, notes, job_url } = req.body;
        const application = await pool.query(`
            UPDATE job_applications 
            SET status = $1, notes = $2, job_url = $3
            WHERE id = $4 AND user_id = $5
            RETURNING *`, 
            [status, notes, job_url, req.params.id, req.user.user.id]);
        res.json({ success: true, data: application.rows[0] });
    } catch (error) {
        res.json({ error: error.message, message: 'applicationRoutes patch' });
    }
});

router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const application = await pool.query(`
            DELETE FROM job_applications 
            WHERE id = $1 AND user_id = $2
            RETURNING *`, 
            [req.params.id, req.user.user.id]);
        res.json({ success: true, data: application.rows[0] });
    } catch (error) {
        res.json({ error: error.message, message: 'applicationRoutes delete' });
    }
});
module.exports = router;