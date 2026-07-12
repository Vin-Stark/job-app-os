const cron = require('node-cron');
const pool = require('../config/db');
const nodemailer = require('nodemailer');



// Company/title/status come from user-submitted JD text — escape them before
// they're interpolated into email HTML so pasted markup can't inject content.
const escapeHtml = (val) => String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


const sendWeeklyReport = async () => {
    console.log('Weekly report triggered at:', new Date());
    // logic will go here
    const result = await pool.query(`
       SELECT ja.id, u.email, ja.status, ja.applied_date,
       jd.job_title, jd.company_name
FROM job_applications ja
LEFT JOIN users u ON u.id = ja.user_id
LEFT JOIN job_descriptions jd ON jd.id = ja.job_id
WHERE ja.created_at >= NOW() - INTERVAL '7 days'
LIMIT 500
    `);
    if (result.rows.length === 500) {
        console.error('[weeklyReport] result hit 500-row cap — some users may be missing from this report');
    }
    const groupedByUser = result.rows.reduce((acc, row) => {
        if (!acc[row.email]) {
            acc[row.email] = [];
        }
        acc[row.email].push(row);
        return acc;
    }, {});

    // Step 3 — send one email per user (we'll build this next)
    for (const email in groupedByUser) {
        const applications = groupedByUser[email];

        // Build the email body
        const appRows = applications.map(app => `
    <tr>
        <td style="padding:14px;">${escapeHtml(app.company_name)}</td>
        <td style="padding:14px;">${escapeHtml(app.job_title)}</td>
        <td style="padding:14px;">${escapeHtml(app.status)}</td>
        <td style="padding:14px;">${new Date(app.applied_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
    </tr>
`).join('');

        try {
        // Send the email
        await transporter.sendMail({
            from: `"Job App OS" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: 'Weekly Application Report',
            html: `
            <table width="620" cellpadding="0" cellspacing="0" style="margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
                <!-- HERO -->
                <tr>
                    <td style="background: #111827; padding: 50px 40px; text-align: center; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 36px; font-weight: 800;">Weekly Application Report</h1>
                        <p style="margin-top: 15px; font-size: 18px; color: #d1d5db;">Here's your job search progress for this week.</p>
                    </td>
                </tr>
                
                <!-- STATS -->
                <tr>
                    <td style="padding: 40px;">
                        <table width="100%">
                            <tr>
                                <td align="center" style="background: #f9fafb; padding: 20px; border-radius: 8px;">
                                    <div style="font-size: 34px; font-weight: bold; color: #111827;">${applications.length}</div>
                                    <div style="color: #6b7280; font-size: 14px;">Applications Submitted</div>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
                
                <!-- APPLICATION TABLE -->
                <tr>
                    <td style="padding: 0 40px 40px;">
                        <h2 style="color: #111827; margin-bottom: 20px;">Application Details</h2>
                        <table width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                            <thead>
                              <tr style="background:#111827;color:white;">
    <th align="left" style="padding:14px;">Company</th>
    <th align="left" style="padding:14px;">Job Title</th>
    <th align="left" style="padding:14px;">Status</th>
    <th align="left" style="padding:14px;">Applied Date</th>
</tr>
                            </thead>
                            <tbody>
                                ${appRows}
                            </tbody>
                        </table>
                    </td>
                </tr>
                
                <!-- CTA -->
                <tr>
                    <td style="background: #111827; text-align: center; padding: 50px 30px;">
                        <h2 style="color: #ffffff; margin-top: 0;">Keep Applying 🚀</h2>
                        <p style="color: #d1d5db; margin-bottom: 25px;">Track your applications, monitor progress, and land your next opportunity.</p>
                        <a href="${process.env.APP_URL}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold;">Open Dashboard</a>
                    </td>
                </tr>
                
                <!-- FOOTER -->
                <tr>
                    <td style="padding: 25px; text-align: center; color: #6b7280; font-size: 13px;">
                        © ${new Date().getFullYear()} Job App OS<br>
                        Automated weekly report.
                    </td>
                </tr>
            </table>
        `
        });
        } catch (err) {
            console.error(`[weeklyReport] failed to send to ${email}:`, err);
        }
    }
};

// Schedule: every Sunday at 9am
cron.schedule('0 9 * * 0', sendWeeklyReport);

module.exports = { sendWeeklyReport };



