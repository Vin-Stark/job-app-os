const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const aws = require('../config/s3');
const multer = require('multer');
const verifyToken = require('../middleware/authMiddleware');
const { PutObjectCommand } = require('@aws-sdk/client-s3');


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
        await pool.query('INSERT INTO resumes (user_id, s3_key, filename, s3_url, file_size) VALUES($1, $2, $3, $4, $5)', [req.user.user.id, s3Key, file.originalname, s3Url, file.size]);
        res.status(201).json({ success: true, message: "Resume uploaded successfully", url: s3Url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;