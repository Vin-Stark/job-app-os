const express = require('express');
const pool = require('../config/db');
const pdfParse = require('pdf-parse');
const verifyToken = require('../middleware/authMiddleware');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const Anthropic = require('@anthropic-ai/sdk');
const aws = require('../config/s3');
const router = express.Router();


const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });


router.post('/parse/:resumeId', verifyToken, async (req, res) => {
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

            const prompt = `You are a resume parser. Extract the following information from this resume text and return it as valid JSON only, no other text:

        {
            "name": "full name",
            "email": "email address",
            "phone": "phone number",
            "summary": "professional summary or objective",
            "skills": ["skill1", "skill2"],
            "experience": [{"company": "", "title": "", "duration": "", "description": ""}],
            "education": [{"institution": "", "degree": "", "year": ""}],
            "projects": [{"name": "", "description": "", "technologies": ""}]
        }

        Resume text:
        ${raw_text}`;


            const message = await anthropic.messages.create({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1500,
                messages: [{ role: 'user', content: prompt }]
            });
            const responseText = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
            const parsedData = JSON.parse(responseText);
            await pool.query(
                `UPDATE resume_parsed_data 
SET name=$1, email=$2, phone=$3, summary=$4, skills=$5, experience=$6, education=$7, projects=$8
WHERE resume_id=$9 AND user_id=$10`,
                [
                    parsedData.name,      // name
                    parsedData.email,    // email
                    parsedData.phone,    // phone
                    parsedData.summary,  // summary
                    JSON.stringify(parsedData.skills),   // skills (as JSON array)
                    JSON.stringify(parsedData.experience), // experience (as JSON array)
                    JSON.stringify(parsedData.education),  // education (as JSON array)
                    JSON.stringify(parsedData.projects),    // projects (as JSON array)
                    resume_id,
                    user_Id
                ]

            );
            res.json({ success: true, data: parsedData });
        }

    } catch (err) {
        res.status(500).json({ error: err.message, message: 'parseRoutes' });
    }
});



module.exports = router;