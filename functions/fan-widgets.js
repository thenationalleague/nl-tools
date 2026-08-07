/**
 * NL Tools — fan-widget staff access (RTDB-triggered).
 *
 *   fanWidgetsAuth — a trigger on app-data/ops-fan-widgets/authRequests/{uid}.
 *                    Verifies the caller is a superadmin with the Admin SDK and
 *                    writes back a Firebase custom token for the SEPARATE
 *                    nl-widgets project, carrying a `staff` claim.
 *
 * Why this exists
 * ---------------
 * The fan data (registrations, predictions, Team of the Week picks) lives in
 * the nl-widgets project, and since the auth hardening a browser cannot list
 * it: `.read` sits at the individual record, so you have to know an id to
 * fetch one. That is deliberate — it is what stops a signed-in fan
 * enumerating every other fan. See embeds/auth-hardening-plan.md.
 *
 * An admin page must not be the exception that undoes that, and the widgets
 * rules cannot recognise staff on their own terms: fans sign in anonymously,
 * so no property of an anonymous session distinguishes staff from anybody
 * else. So the claim is minted here, in the project where the staff role model
 * actually exists, and the widgets rules grant tree-wide read on that claim.
 *
 * Trust chain: nl-tools Firebase Auth → this trigger → nl-widgets. Verified
 * server-side at every link. A fan cannot obtain the claim, because minting one
 * means passing the superadmin check below.
 *
 * Why a trigger and not a callable
 * --------------------------------
 * This started as an onCall. It deployed and then failed at "Unable to set the
 * invoker for the IAM policy on mintWidgetsToken" (07/08/2026) — the project
 * carries an org policy that blocks `allUsers` on NEW Cloud Run services, which
 * is why the existing callables still update fine but a new one cannot be
 * created. programme.js and club-directory.js hit the same wall and record the
 * RTDB-triggered path as the org-policy-proof alternative; this is that path.
 *
 * Cost of the swap: Eventarc delivery adds a few seconds. This runs once per
 * page load, behind a spinner, for one person — an easy trade.
 *
 * Flow
 * ----
 *   1. The page (already signed in via auth-guard) writes {} to
 *      authRequests/<uid>.
 *   2. This trigger checks the role, deletes the request, and writes
 *      authGrants/<uid> = { ok, customToken } — or { ok:false, error }.
 *   3. The page reads the grant, deletes it, and signs in to nl-widgets with
 *      the token.
 *
 * Keyless by necessity: the NL Google org blocks service-account key creation.
 * Signing a custom token for another project needs that project's service
 * account identity, so the SDK is pointed at it by NAME and signs through IAM
 * — which requires this function's service account to hold
 * roles/iam.serviceAccountTokenCreator on the nl-widgets Admin SDK account.
 * Without that grant, minting fails at signBlob; that is the first thing to
 * check if this stops working.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const ROOT = "app-data/ops-fan-widgets";

const WIDGETS_PROJECT = "nl-widgets";
const WIDGETS_SA = "firebase-adminsdk-fbsvc@nl-widgets.iam.gserviceaccount.com";
const WIDGETS_APP = "nl-widgets";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* Same service account as account.js, programme.js and club-directory.js:
     the gen-2 default (compute SA) holds no Firebase roles, so RTDB drops its
     connection and token minting fails. This is also the identity that must
     hold Token Creator on the nl-widgets service account above. */
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

/* onValueWritten, not onValueCreated — the request path is keyed on the
   caller's uid, so a second visit rewrites the same node rather than creating
   a new one, and onValueCreated would never fire again for that person. */
exports.fanWidgetsAuth = onValueWritten(TRIGGER_OPTS, async (event) => {
  const uid = event.params.uid;
  if (!event.data.after.exists()) return;   // our own delete, below

  const db = admin.database();
  // Clear the request first: whatever happens next, it must not sit there and
  // re-trigger.
  await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});
  const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

  try {
    /* The role is read from the database, not from a token claim. A claim can
       be stale after a demotion, and this check is the only thing standing
       between a fan and everyone else's data. */
    const snap = await db.ref("users/" + uid + "/role").once("value");
    const role = String(snap.val() || "");
    if (role !== "superadmin") {
      logger.warn("fanWidgetsAuth denied", { uid, role: role || "(none)" });
      return grant({ ok: false, error: "not-superadmin" });
    }

    /* Distinct uid namespace so a staff session in the widgets project can
       never collide with a fan's anonymous one, and is obvious in an audit. */
    const customToken = await widgetsApp().auth()
      .createCustomToken("nlstaff_" + uid, { staff: true, grantedTo: uid });

    logger.info("fanWidgetsAuth granted", { uid });
    return grant({ ok: true, customToken });
  } catch (err) {
    /* Most likely the Token Creator grant is missing — see the header. Report
       it as a grant rather than throwing, so the page can say something useful
       instead of hanging on a spinner. */
    /* NEVER pass a field called `message` here. firebase-functions' logger
       uses that key for the log line itself, so the first attempt at this
       clobbered the real error with a stack trace of the logger — the console
       showed "fanWidgetsAuth failed" and nothing about the cause. The reason
       goes in the line, and any extra fields are named something else.

       An error that hides its reason costs more than the failure does. */
    const why = (err && (err.message || err.code)) || String(err);
    logger.error("fanWidgetsAuth failed for " + uid + ": " + why, {
      uid, reason: why, errCode: (err && err.code) || null,
    });
    return grant({ ok: false, error: "mint-failed", detail: String(why).slice(0, 300) });
  }
});
