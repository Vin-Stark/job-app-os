const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const aws = require('../config/s3');
const multer = require('multer');
const verifyToken = require('../middleware/authMiddleware');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const pdfParse = require('pdf-parse');
console.log(pdfParse);


const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', verifyToken, upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const file = req.file;
        const s3Key = `resumes/${req.user.user.id}-${Date.now()}-${file.originalname}`;

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype
        });

        await aws.send(command);
        const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
        const resumeResult = await pool.query('INSERT INTO resumes (user_id, s3_key, filename, s3_url, file_size) VALUES($1, $2, $3, $4, $5) RETURNING id', [req.user.user.id, s3Key, file.originalname, s3Url, file.size]);
        const resumeId = resumeResult.rows[0].id;
        const pdfData = await pdfParse(Buffer.from(file.buffer));
        const rawText = pdfData.text
        await pool.query('INSERT INTO resume_parsed_data (user_id, resume_id, raw_text) VALUES($1, $2, $3)', [req.user.user.id, resumeId, rawText]);
        res.status(201).json({ success: true, message: "Resume uploaded and text extracted successfully", resumeId, url: s3Url });
    } catch (err) {
        res.status(500).json({ error: err.message, message: "ResumeRoutes" });
    }
});

router.get("/list", verifyToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT id, filename, s3_url, created_at FROM resumes WHERE user_id = $1", [req.user.user.id]);
        res.json({ success: true, resumes: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete("/delete/:id", verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { id: user_id } = req.user.user;
        const resume = await pool.query("SELECT s3_key FROM resumes WHERE id = $1 AND user_id = $2", [id, user_id]);
        if (resume.rows.length === 0) {
            return res.status(404).json({ error: "Resume not found" });
        }
        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: resume.rows[0].s3_key
        });
        await aws.send(command);
        await pool.query("DELETE FROM resumes WHERE id = $1 AND user_id = $2", [id, user_id]);
        res.json({ success: true, message: "Resume deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;