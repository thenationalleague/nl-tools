/**
 * NL Tools — fan-widget staff access.
 *   mintWidgetsToken — issues a superadmin a short-lived sign-in token for the
 *                      SEPARATE nl-widgets project, carrying a `staff` claim.
 *
 * Why this exists
 * ---------------
 * The fan data (registrations, predictions, Team of the Week picks) lives in
 * the nl-widgets project, and since the auth hardening a browser cannot list
 * it: `.read` sits at the individual record, so you have to know an id to
 * fetch one. That is deliberate — it is what stops any signed-in fan
 * enumerating every other fan. See embeds/auth-hardening-plan.md.
 *
 * An admin page must not be the exception that undoes that. Loosening the
 * rules for "staff" is not possible in that project on its own terms: fans
 * sign in anonymously, so there is no property of an anonymous session that
 * distinguishes a member of staff from anybody else.
 *
 * This closes that gap without duplicating the data. The caller is
 * authenticated in nl-tools, where the staff role model actually exists; this
 * function verifies they are a superadmin THERE, and issues them a token for
 * nl-widgets carrying `staff: true`. The widgets rules grant tree-wide read on
 * that claim alone, so the page can open live listeners and nothing is copied
 * anywhere.
 *
 * The trust chain is: nl-tools Firebase Auth → this function → nl-widgets.
 * Every link is verified server-side. A fan cannot obtain the claim, because
 * minting one requires passing the superadmin check here.
 *
 * Keyless by necessity: the NL Google org blocks service-account key creation.
 * Signing a custom token for another project needs that project's service
 * account identity, so the SDK is pointed at it by NAME and signs through IAM
 * — which requires this function's service account to hold
 * roles/iam.serviceAccountTokenCreator on the nl-widgets Admin SDK account.
 * Without that grant, minting fails with a permission error at signBlob; that
 * is the first thing to check if this stops working.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const WIDGETS_PROJECT = "nl-widgets";
const WIDGETS_SA = "firebase-adminsdk-fbsvc@nl-widgets.iam.gserviceaccount.com";
const WIDGETS_APP = "nl-widgets";

const CALL_OPTS = {
  cors: ["https://nl.tools", "https://thenationalleague.github.io"],
  memory: "256MiB",
  maxInstances: 5,
  /* Same reason as account.js: the gen-2 default compute SA holds no Firebase
     roles. This one carries RTDB + Auth Admin, and is the identity that must
     be granted Token Creator on the nl-widgets service account above. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* A second admin app, pointed at nl-widgets by name only — no credential file
   exists or could exist. serviceAccountId is what lets createCustomToken sign
   through the IAM API instead of with a local private key. */
function widgetsApp() {
  const existing = admin.apps.find((a) => a && a.name === WIDGETS_APP);
  if (existing) return existing;
  return admin.initializeApp({
    projectId: WIDGETS_PROJECT,
    serviceAccountId: WIDGETS_SA,
  }, WIDGETS_APP);
}

exports.mintWidgetsToken = onCall(CALL_OPTS, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;

  /* The role is read from the database, not from the caller's token. A custom
     claim could be stale after a demotion; the RTDB record is the live answer,
     and this is the check that stands between a fan and everyone's data. */
  const snap = await admin.database().ref("users/" + uid + "/role").once("value");
  const role = String(snap.val() || "");
  if (role !== "superadmin") {
    logger.warn("mintWidgetsToken denied", { uid, role: role || "(none)" });
    throw new HttpsError("permission-denied", "Superadmin only.");
  }

  /* Distinct uid namespace so a staff session in the widgets project can never
     collide with a fan's anonymous one, and is obvious in any audit trail. */
  const token = await widgetsApp().auth().createCustomToken("nlstaff_" + uid, {
    staff: true,
    grantedTo: uid,
  });

  logger.info("mintWidgetsToken issued", { uid });
  return { token };
});
