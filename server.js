const express = require('express');
const dotenv = require('dotenv');
dotenv.config(); // Load environment variables
const cors = require('cors');
const pool = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const passport = require('passport');
require('./src/config/passport');



const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(passport.initialize());

// Test route
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.json({ message: "Server running" });
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ success: true, time: result.rows[0] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
