const express = require('express');
const dotenv = require('dotenv');
dotenv.config(); // Load environment variables
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const passport = require('passport');
require('./src/config/passport');
const { apiLimiter } = require('./src/middleware/rateLimiters');
const authRoutes = require('./src/routes/authRoutes');
const resumeRoutes = require('./src/routes/resumeRoutes');
const parseRoutes = require('./src/routes/parseRoutes');
const applicationRoutes = require('./src/routes/applicationRoutes');
const generateRoutes = require('./src/routes/generateRoutes');
const linksRoutes = require('./src/routes/linksRoutes');
const weeklyReport = require('./src/jobs/weeklyReport');


const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(helmet());
app.use(compression());
// CORS allowlist: the web app origin plus the pinned Chrome-extension origin.
// The extension's fetches come from chrome-extension://<pinned-id> (stable via
// the "key" in manifest.json); requests with no Origin header (server-to-server,
// curl) are allowed through so health checks and tests aren't blocked.
const allowedOrigins = [process.env.FRONTEND_URL || 'http://localhost:5173'];
if (process.env.EXTENSION_ORIGIN) allowedOrigins.push(process.env.EXTENSION_ORIGIN);
app.use(cors({
  origin: (origin, cb) => {
    // Allow no-origin (curl/health checks) and allowlisted origins. Reject
    // others by withholding CORS headers (cb(null,false)) rather than throwing —
    // the browser still blocks the response, but we don't emit 500s for it.
    cb(null, !origin || allowedOrigins.includes(origin));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use(passport.initialize());
app.use(apiLimiter);

// Routes
// NOTE: legacy jobRoutes (/api/jobs) and matchRoutes (/api/match) are
// intentionally NOT mounted — they were superseded by generateRoutes
// /analyze + /finalize (deterministic ATS scoring). Mounting them again
// would reopen the LLM-scored ATS path. Files kept for reference only.
app.use('/api/auth', authRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/parse', parseRoutes);
app.use('/api/application', applicationRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/links', linksRoutes);


app.get('/', (req, res) => {
  res.json({ message: "Server running" });
});


// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
