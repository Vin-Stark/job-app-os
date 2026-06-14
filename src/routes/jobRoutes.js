const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const verifyToken = require('../middleware/authMiddleware');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const {
    NoH1BSponsorshipPhrases,
    NoOPTCPTSupportPhrases,
    PermanentAuthOnlyPhrases,
    noH1BSponsorshipRegexes,
    noOPTCPTRegexes,
    permanentAuthOnlyRegexes,
    sponsorshipFriendlyPhrases,
    sponsorshipFriendlyRegexes
} = require('../utils/visaSponsorshipFilters');




function noH1BSponsorshipCheck(rawText) {
    const text = rawText.toLowerCase();
    return (
        NoH1BSponsorshipPhrases.some(p => text.includes(p.toLowerCase())) ||
        noH1BSponsorshipRegexes.some(r => r.test(rawText))
    );
}

function blocksOPTCPT(rawText) {
    const text = rawText.toLowerCase();
    return (
        NoOPTCPTSupportPhrases.some(p => text.includes(p.toLowerCase())) ||
        noOPTCPTRegexes.some(r => r.test(rawText))
    );
}

function requiresPermanentAuth(rawText) {
    const text = rawText.toLowerCase();
    return (
        PermanentAuthOnlyPhrases.some(p => text.includes(p.toLowerCase())) ||
        permanentAuthOnlyRegexes.some(r => r.test(rawText))
    );
}

function supportsSponsorship(rawText) {
    const text = rawText.toLowerCase();
    return (
        sponsorshipFriendlyPhrases.some(p => text.includes(p.toLowerCase())) ||
        sponsorshipFriendlyRegexes.some(r => r.test(rawText))
    );
}


router.post('/analyze', verifyToken, async (req, res) => {
    try {
        const { raw_text, job_title, company_name } = req.body;

        const visa_status = await pool.query(
            `SELECT work_authorization_status FROM users WHERE id = $1`,
            [req.user.user.id]
        );

        const work_authorization_status = visa_status.rows[0].work_authorization_status;
        console.log({
    blocksOPT: blocksOPTCPT(raw_text),
    requiresPermanent: requiresPermanentAuth(raw_text),
    supports: supportsSponsorship(raw_text),
    userStatus: work_authorization_status
});

        if (work_authorization_status !== 'permanent') {
            // If the JD explicitly supports sponsorship, let them through regardless
            if (!supportsSponsorship(raw_text)) {
                if (work_authorization_status === 'needs_h1b') {
                    if (blocksOPTCPT(raw_text) || requiresPermanentAuth(raw_text) || noH1BSponsorshipCheck(raw_text)) {
                        return res.json({ success: false, eligible: false, message: 'This job requires H1-B sponsorship, which you do not have.' });
                    }
                } else if (work_authorization_status === 'opt_cpt') {
                    if (blocksOPTCPT(raw_text) || requiresPermanentAuth(raw_text)) {
                        return res.json({ success: false, eligible: false, message: 'This job does not accept OPT/CPT applications. Consider saving the job and applying when you have permanent authorization.' });
                    }
                }
            }
        }

                const prompt = `You are a job description parser. Extract the following from this job description and return valid JSON only, no other text:

        {
            "location": "",
            "experience_needed": "",
            "preferred_qualifications": [],
            "must_have_qualifications": []
        }

        Job description:
        ${raw_text}`;

                const message = await anthropic.messages.create({
                    model: 'claude-haiku-4-5-20251001',
                    max_tokens: 1500,
                    messages: [{ role: 'user', content: prompt }]
                });

                const responseText = message.content[0].text.replace(/```json\n?|\n?```/g, '').trim();
                const parsedData = JSON.parse(responseText);

                await pool.query(
                    `INSERT INTO job_descriptions (user_id, job_title, company_name, raw_text, location, experience_needed, preferred_qualifications, must_have_qualifications)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        req.user.user.id,
                        job_title,
                        company_name,
                        raw_text,
                        parsedData.location,
                        parsedData.experience_needed,
                        JSON.stringify(parsedData.preferred_qualifications),
                        JSON.stringify(parsedData.must_have_qualifications)
                    ]
                );

        res.json({ success: true, data: parsedData });

    } catch (error) {
        res.status(500).json({ error: error.message, message: 'JobRoutes' });
    }
});

module.exports = router;