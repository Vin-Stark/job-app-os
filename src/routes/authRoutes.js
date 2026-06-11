const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const verifyToken = require('../middleware/authMiddleware');

router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            return res.status(400).json({ error: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, Number(process.env.SALT_ROUNDS));

        await pool.query('INSERT INTO users(name, email, password) VALUES($1, $2, $3)', [name, email, hashedPassword]);

        res.status(201).json({ success: true, message: "User registered successfully" });


    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
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
            expiresIn: process.env.JWT_EXPIRES_IN
        });
        res.json({ success: true, token, user: payload.user });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/me', verifyToken, (req, res) => {
    res.json({ user: req.user });
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login', session: false }),
    (req, res) => {
        const payload = {


            user: {
                id: req.user.id,
                name: req.user.name,
                email: req.user.email
            }
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRES_IN
        });
        res.json({ success: true, token, user: payload.user });

        // req.user contains the user from passport
        // generate JWT and send it back
    }
);



module.exports = router;

