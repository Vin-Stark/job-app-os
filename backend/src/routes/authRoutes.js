const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const verifyToken = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiters');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

router.post('/register', authLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }
        if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
            return res.status(400).json({ error: "Please enter a valid email address" });
        }
        if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
            // 72-byte upper bound: bcrypt truncates anything longer
            return res.status(400).json({ error: "Password must be 8–72 characters" });
        }
        if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
            return res.status(400).json({ error: "Name must be 1–100 characters" });
        }

        const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            return res.status(400).json({ error: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, Number(process.env.SALT_ROUNDS));

        await pool.query('INSERT INTO users(name, email, password) VALUES($1, $2, $3)', [name, email, hashedPassword]);

        res.status(201).json({ success: true, message: "User registered successfully" });


    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed. Please try again.', message: 'authRoutes' });
    }
});


router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }
        const result = await pool.query('SELECT id, name, email, password FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        if (!result.rows[0].password) {
            return res.status(401).json({ error: "This account uses Google sign-in. Please continue with Google." });
        }

        const passwordMatch = await bcrypt.compare(password, result.rows[0].password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const payload = {
            user: {
                id: result.rows[0].id,
                name: result.rows[0].name,
                email: result.rows[0].email
            }
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            // Fallback so a missing env var can never mint tokens that live forever
            expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        });
        res.json({ success: true, token, user: payload.user });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed. Please try again.', message: 'authRoutes' });
    }
});

router.get('/me', verifyToken, async (req, res) => {
    try {
        const userId = req.user.user.id;
        const result = await pool.query(
            'SELECT id, name, email, work_authorization_status FROM users WHERE id = $1',
            [userId]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found', message: 'authRoutes' });
        }
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load profile.', message: 'authRoutes' });
    }
});

router.patch('/work-auth', verifyToken, async (req, res) => {
    try {
        const userId = req.user.user.id;
        const { work_authorization_status } = req.body;
        const valid = ['permanent', 'opt_cpt', 'needs_h1b'];
        if (!valid.includes(work_authorization_status)) {
            return res.status(400).json({ error: 'Invalid work_authorization_status', message: 'authRoutes' });
        }
        await pool.query(
            'UPDATE users SET work_authorization_status = $1 WHERE id = $2',
            [work_authorization_status, userId]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update work authorization.', message: 'authRoutes' });
    }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: `${FRONTEND_URL}/login`, session: false }),
    (req, res) => {
        const payload = {
            user: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email
            }
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN || '7d'
        });
        // Token travels in the URL FRAGMENT, not the query string —
        // fragments never reach server logs, proxies, or the Referer header.
        res.redirect(`${FRONTEND_URL}/auth/callback#token=${token}`);
    }
);



module.exports = router;

