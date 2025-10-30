import * as passport from "passport";

/**
 * Configure Passport serialization/deserialization
 * This is required for session-based OAuth strategies
 */
export function configurePassport() {
  // Serialize user into session
  passport.serializeUser(function (user: any, done) {
    done(null, user);
  });

  // Deserialize user from session
  passport.deserializeUser(function (obj: any, done) {
    done(null, obj);
  });

  // console.log("✅ Passport serialization configured");
}
