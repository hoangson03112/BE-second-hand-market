require("dotenv").config();
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Account = require("../models/Account");
const GenerateToken = require("../utils/GenerateToken");
const GenerateRefreshToken = require("../utils/GenerateRefreshToken");
const bcrypt = require("bcrypt");

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL;

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: `${BASE_URL}/eco-market/auth/google/callback`,
        scope: ["profile", "email"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const googleId = profile.id;
          const displayName = profile.displayName || profile.name?.givenName || "";

          if (!email) {
            return done(new Error("Google không cung cấp email"), null);
          }

          let account = await Account.findOne({
            $or: [{ googleId }, { email }],
          });

          if (account) {
            if (!account.googleId) {
              account.googleId = googleId;
              await account.save();
            }
            return done(null, account);
          }

          const username = `google_${googleId.slice(-12)}`;
          const existingUsername = await Account.findOne({ username });
          const finalUsername = existingUsername ? `google_${Date.now()}` : username;
          const randomPassword = await bcrypt.hash(
            `google_${googleId}_${Date.now()}`,
            10
          );

          account = new Account({
            username: finalUsername,
            email,
            fullName: displayName,
            status: "active",
          });
          await account.save();
          return done(null, account);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
}

module.exports = passport;
