const { Pool } = require('pg')

// DATABASE_URL takes precedence (Neon/Render/any hosted provider).
// Falls back to individual vars for local dev.
const pool = new Pool(
    process.env.DATABASE_URL
        ? {
            connectionString: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 20,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 2_000,
        }
        : {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 2_000,
        }
)

module.exports = pool;

