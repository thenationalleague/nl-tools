/**
 * NL Tools — Cloud Functions.
 *   consumeInvite / submitAccessRequest / withdrawAccessRequest
 *                     — account-lifecycle callables (server-minted roles).
 *                       See account.js and system/rtdb/SECURITY-role-self-grant.md.
 *   fanWidgetsAuth    — issues a superadmin a staff token for the separate
 *                       nl-widgets project, so the Fan Widgets tool can read
 *                       fan data live without mirroring it. See fan-widgets.js.
 *   programmeEnter / programmeClaim
 *                     — Programme Packs passcode → scoped `pClub` claim, so
 *                       Storage/RTDB rules can enforce write-own for passcode
 *                       (non-portal) clubs. See programme.js.
 *
 * NL Cup Footage retired 15/08/2026. makeProxy (360p preview proxies on upload)
 * and onFootageDeleted (mirroring Storage deletes back to the catalogue) went
 * with it — see system/retired/nl-cup-footage.md, which keeps the decisions. Their code is in
 * git history if the tool ever returns.
 *
 * NOTE: files under footage/national-league-cup/ are still in the bucket and
 * still cost money. Removing the functions does not remove the video, and the
 * Storage rules block for footage/** deliberately stays until someone clears it
 * — deleting the rule first would orphan files nobody can reach to tidy.
 */
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

/* Explicit databaseURL: the RTDB lives in europe-west1, and the SDK's guessed
   default (<project>.firebaseio.com) only serves US instances — connecting to
   it hangs forever. Symptom when missing: any function touching RTDB stalls
   to its timeout (seen live 25/07/2026 on consumeInvite). */
admin.initializeApp({
  databaseURL: "https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app",
});
setGlobalOptions({ region: "europe-west2" });


// Account-lifecycle callables (invite acceptance, access requests) — the
// server-side role writes that closed the self-grant hole. Kept in their own
// module; exported from here so `firebase deploy --only functions` sees them.
Object.assign(exports, require("./account"));

// Programme Packs passcode → scoped-claim callables (programmeEnter /
// programmeClaim). Same reason as above: exported here so a plain
// `firebase deploy --only functions` picks them up. See functions/programme.js.
Object.assign(exports, require("./programme"));

// Fan-widget staff access (fanWidgetsAuth) — RTDB-triggered for the same
// org-policy reason as programme.js and club-directory.js: a NEW callable
// cannot be granted a public invoker on this project. It is the only route by
// which a browser can read the fan data live without that data being copied
// anywhere. See functions/fan-widgets.js.
Object.assign(exports, require("./fan-widgets"));

// Club Directory passcode → scoped-claim trigger (clubDirectoryAuth). Same
// shape and the same org-policy reason as programme.js above.
Object.assign(exports, require("./club-directory"));

// UW Promo Codes credential → scoped-claim trigger (uwPromoAuth, plus the
// sandbox twin uwPromoAuthTest). Third instance of the same shape and the same
// org-policy reason as programme.js. Note the extra per-club throttle it can
// afford that the others cannot — see the header there.
Object.assign(exports, require("./uw-promo"));

// One club code → a `club` claim (clubCodeAuth). Fourth instance of the same
// shape, and the one meant to absorb the others: a single credential per club
// covering every club-facing gated tool, with entitlement decided per tool in
// the RTDB rules rather than by which code you hold. Handbook first, Directory
// second, Programme Packs migrated last. See functions/club-code.js and
// system/club-code-plan.md.
Object.assign(exports, require("./club-code"));

// NLS → RTDB live ingester (nlsIngestTick / nlsIngestHourly). Scheduled rather
// than triggered, and it writes to the nl-widgets database rather than this
// project's — see functions/nls-ingester.js for both reasons. Exported here so
// `firebase deploy --only functions` creates the two Cloud Scheduler jobs; no
// terminal and no gcloud, which was the deciding constraint on its shape.
Object.assign(exports, require("./nls-ingester"));

