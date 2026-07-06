const { rateLimit } = require('express-rate-limit');

// Limits are sized to never block a real user — a human job-seeker can't
// exceed them — while capping brute-force attempts and runaway AI spend.

// Login/register: brute-force + enumeration protection.
// 20 attempts / 15 min per IP is far beyond any legitimate retry pattern.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in a few minutes.', message: 'rateLimiters' },
});

// Claude-backed routes: per-user (not per-IP) so shared networks aren't
// penalized. 60 AI requests/hour ≈ 20+ full analyze→finalize cycles —
// several times what an active job hunt needs, but caps worst-case
// API spend at a few dollars/hour if a token ever leaks.
const aiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user.user.id}`,
    message: { error: 'AI request limit reached for this hour. Your saved data is untouched — try again shortly.', message: 'rateLimiters' },
});

// Global backstop: generous enough for heavy UI usage (React Query refetches
// included), tight enough to blunt scraping/DoS from one address.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Slow down and try again shortly.', message: 'rateLimiters' },
});

module.exports = { authLimiter, aiLimiter, apiLimiter };
