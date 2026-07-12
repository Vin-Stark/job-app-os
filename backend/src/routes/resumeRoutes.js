const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const aws = require('../config/s3');
const multer = require('multer');
const verifyToken = require('../middleware/authMiddleware');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const pdfParse = require('pdf-parse');

const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5MB — resumes are 1-2 pages

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_RESUME_BYTES },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') return cb(null, true);
        cb(new Error('Only PDF files are accepted'));
    },
});

// Wrap multer so its errors (size/type) return clean JSON instead of a 500
const uploadResume = (req, res, next) => {
    upload.single('resume')(req, res, (err) => {
        if (err) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? 'File too large — maximum 5MB'
                : err.message;
            return res.status(400).json({ error: msg, message: 'ResumeRoutes' });
        }
        next();
    });
};

router.post('/upload', verifyToken, uploadResume, async (req, res) => {
    let s3Key = null;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const file = req.file;

        // Extract text FIRST — if the PDF is corrupt or encrypted this throws before
        // anything is written to S3 or the DB, leaving nothing to clean up.
        const pdfData = await pdfParse(Buffer.from(file.buffer));
        const rawText = pdfData.text;

        // Sanitize the client-supplied filename before it touches the S3 key
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
        s3Key = `resumes/${req.user.user.id}-${Date.now()}-${safeName}`;

        await aws.send(new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype
        }));

        const s3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
        const resumeResult = await pool.query(
            'INSERT INTO resumes (user_id, s3_key, filename, s3_url, file_size) VALUES($1, $2, $3, $4, $5) RETURNING id',
            [req.user.user.id, s3Key, file.originalname, s3Url, file.size]
        );
        const resumeId = resumeResult.rows[0].id;
        await pool.query(
            'INSERT INTO resume_parsed_data (user_id, resume_id, raw_text) VALUES($1, $2, $3)',
            [req.user.user.id, resumeId, rawText]
        );
        res.status(201).json({ success: true, message: "Resume uploaded and text extracted successfully", resumeId });
    } catch (err) {
        // S3 upload succeeded but a DB write failed — remove the orphaned S3 object.
        if (s3Key) {
            aws.send(new DeleteObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: s3Key }))
                .catch(e => console.error('[resumeRoutes] S3 cleanup failed after upload error:', e));
        }
        console.error(err);
        res.status(500).json({ error: 'Resume upload failed. Please try again.', message: 'ResumeRoutes' });
    }
});

router.get("/list", verifyToken, async (req, res) => {
    try {
        const result = await pool.query("SELECT id, filename, file_size, created_at FROM resumes WHERE user_id = $1", [req.user.user.id]);
        res.json({ success: true, resumes: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load resumes.', message: "ResumeRoutes" });
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
        const { s3_key } = resume.rows[0];

        // Delete child rows first so FK constraints don't block the parent delete,
        // and so the DB state is always consistent before we touch S3.
        await pool.query("DELETE FROM resume_supplements WHERE resume_id = $1 AND user_id = $2", [id, user_id]);
        await pool.query("DELETE FROM resume_projects    WHERE resume_id = $1 AND user_id = $2", [id, user_id]);
        await pool.query("DELETE FROM resume_job_matches WHERE resume_id = $1 AND user_id = $2", [id, user_id]);
        await pool.query("DELETE FROM resume_parsed_data WHERE resume_id = $1 AND user_id = $2", [id, user_id]);
        await pool.query("DELETE FROM resumes            WHERE id = $1        AND user_id = $2", [id, user_id]);

        // S3 delete AFTER all DB commits — a failed DB delete can be retried;
        // a deleted S3 object cannot be recovered.
        await aws.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3_key
        }));
        res.json({ success: true, message: "Resume deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete resume.', message: 'ResumeRoutes' });
    }
});

module.exports = router;