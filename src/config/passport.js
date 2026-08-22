require("dotenv").config();
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const Account = require("../models/Account");

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
          const displayName =
            profile.displayName || profile.name?.givenName || "";
          const pictureUrl = profile.photos?.[0]?.value;

          if (!email) {
            return done(new Error("Google không cung cấp email"), null);
          }

          let account = await Account.findOne({
            $or: [{ googleId }, { email }],
          });

          if (account) {
            let shouldSave = false;

            if (!account.googleId) {
              account.googleId = googleId;
              shouldSave = true;
            }

            if (!account.fullName && displayName) {
              account.fullName = displayName;
              shouldSave = true;
            }

            if (!account.avatar?.url && pictureUrl) {
              account.avatar = {
                url: pictureUrl,
                publicId: `google_${googleId}`,
              };
              shouldSave = true;
            }

            if (shouldSave) {
              await account.save();
            }
            return done(null, account);
          }
          let baseUsername = email.split("@")[0];
          baseUsername = baseUsername
            .replace(/[^a-zA-Z0-9_.-]/g, "")
            .slice(0, 15);
          let finalUsername = baseUsername;
          let suffix = 1;
          while (await Account.findOne({ username: finalUsername })) {
            finalUsername = `${baseUsername}_${suffix}`;
            suffix += 1;
          }

          const avatarFromGoogle = pictureUrl
            ? { url: pictureUrl, publicId: `google_${googleId}` }
            : undefined;

          account = new Account({
            username: finalUsername,
            email,
            fullName: displayName,
            status: "active",
            googleId,
            role: "buyer",
            ...(avatarFromGoogle && { avatar: avatarFromGoogle }),
          });

          await account.save();
          return done(null, account);
        } catch (err) {
          return done(err, null);
        }
      },
    ),
  );
}

module.exports = passport;
