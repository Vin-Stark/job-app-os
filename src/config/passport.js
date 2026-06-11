const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const pool = require('./db');

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
    },async (accessToken //access the user's Google data
        , refreshToken, //to get a new accessToken when it expires
         profile, //the user's profile info from Google
          done //a callback function to complete the authentication
        ) => {
        try {
            const result = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
            if(result.rows.length === 0) {
                const newUser = await pool.query('INSERT INTO users(google_id, name, email) VALUES($1, $2, $3) RETURNING *', [profile.id, profile.displayName, profile.emails[0].value]);
                return done(null, newUser.rows[0]);
            }
            return done(null, result.rows[0]);
        } catch(err) {
            return done(err, null);
        }
    }
));


module.exports = passport;