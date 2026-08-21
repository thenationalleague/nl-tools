/**
 * NL Tools — Programme Packs passcode → scoped claim (RTDB-triggered).
 *
 *   programmeAuth — an RTDB trigger on app-data/media-programme/authRequests/{uid}.
 *                   Validates the club passcode (or the caller's portal role)
 *                   with the Admin SDK and writes back a Firebase custom token
 *                   carrying a `pClub` claim.
 *
 * Why a trigger and not a callable
 * --------------------------------
 * This started as two onCall callables. They deployed, but Firebase could not
 * grant them a public invoker: the project carries an org policy that blocks
 * `allUsers` on new Cloud Run services ("Failed to set the IAM Policy on the
 * Service .../programmeenter", 03/08/2026). Clubs have no Google account, so an
 * un-invokable callable is a dead end. footage/NEXT.md hit the same wall on
 * 13/07/2026 with getFootageUrl and records the RTDB-triggered path as the
 * org-policy-proof alternative — this is that path.
 *
 * Cost of the swap: Eventarc delivery adds seconds (footage measured ~15-20s,
 * structural rather than cold-start). That killed it for video previews, which
 * happen constantly. Here it runs on a passcode gate that a device hits once
 * every 30 days, behind a spinner — an acceptable trade for real enforcement.
 *
 * What this buys
 * --------------
 * The passcode is never checked in the browser and `config` is never readable
 * by a client. The answer comes back as a `pClub` claim (a club's clubs-meta
 * code, or 'NL', or '*' for NL admins) that Storage and RTDB rules enforce
 * write-own against. With plain anonymous auth the token would carry no club
 * identity at all, so the rules could not tell FGR from Barnet and anyone
 * holding any club's code could write or remove all 72 folders.
 *
 * Flow
 * ----
 *   1. Client signs in anonymously (Identity Toolkit — no Cloud Run, so the org
 *      policy does not apply) and writes { code } to authRequests/<uid>.
 *   2. This trigger validates, deletes the request (the passcode never lingers),
 *      and writes authGrants/<uid> = { ok, customToken, club } — or { ok:false }.
 *   3. Client reads the grant, deletes both nodes while it still owns that uid,
 *      then signs in with the custom token.
 *
 * Admin variant: the caller is already signed in on the portal (auth-guard), so
 * it writes { admin: true } and this checks users/<uid>/role server-side.
 *
 * Migration note: when /programme moves behind the portal, this file is deleted.
 * `pClub` is replaced by the portal's users/<uid>/club and the rules change from
 * `auth.token.pClub === $club` to the portal equivalent — nothing else moves,
 * because the Storage paths are keyed on the same clubs-meta code the portal
 * uses. See programme/README.md.
 */
const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const ROOT = "app-data/media-programme";

/* WHERE THE PASSCODES LIVE — relocated 21/08/2026.
   CANONICAL: app-data/club-codes/clubs/<KEY> and app-data/club-codes/nl.

   They stopped being Programme's passcodes the moment they became the estate's
   one club credential (system/club-code-plan.md), so they live under a node
   named for what they are rather than for the first tool that used them.

   No `config` level under it: the node is already called club-codes, and that
   wrapper is what broke this. Both functions read config/clubs, the 73 live
   records had landed at the shorter path, and every club in the estate was
   refused until someone opened the console and looked. Accepting where the
   data is beats moving 73 live secrets by hand to suit a level of nesting.

   Programme's own DATA (folders, files, trash, audit) stays under ROOT. Only
   the credential moved. Identical resolution to club-code.js — one credential,
   one home, two doors, and tests/club-code.test.mjs runs the same fixtures
   through both and fails if they ever disagree. */
const CODES_ROOT = "app-data/club-codes";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* Same service account as account.js — the gen-2 default (compute SA) holds
     no Firebase roles, so RTDB drops its connection and token minting fails. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* Passcodes come off a printed card and get retyped, so match on the normalised
   form: uppercase, alphanumerics only. The client has its own copy in
   programme/_shared.js — tests/programme.test.mjs asserts the two agree. */
function normCode(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* Constant-time-ish compare — removes the trivial early-exit timing signal.
   The passcode space (31^6 ≈ 887M) plus the throttle below is the real
   defence. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Which club does this passcode open?
 *
 * The passcode alone, because it is the whole credential. A per-club ?c= link
 * token used to narrow this search to one entry, guarding against two clubs
 * ever drawing the same six characters. It granted nothing — the bare
 * /programme/ URL has always accepted a passcode on its own — but regenerating
 * rotated it alongside the passcode, so every bookmark and emailed URL in that
 * club went stale and a correct new passcode came back "Passcode not
 * recognised" (Sutton, 04/08/2026): the one message that sends someone to the
 * console convinced the regeneration itself had failed.
 *
 * The collision it guarded is now prevented instead of arbitrated — the console
 * refuses to mint a passcode another club already holds. A `token` field may
 * still sit on old config records; nothing reads it.
 */
/* The stored field is `passcode` on records this console has minted, and `code`
   on anything written in the club-codes vocabulary. Both are read, because the
   two doors now share one config and MUST agree on where a code lives: a record
   readable by one function and not the other means a club is told their code is
   wrong by one tool and let in by the other, which is the most confusing
   possible way for this to fail. club-code.js has read both since the
   relocation; this side did not, which is that exact failure waiting to happen
   — and did happen, 21/08/2026. Identical to club-code.js's storedCode. */
function storedCode(rec) {
  return normCode((rec && (rec.passcode || rec.code)) || "");
}

function pickClub(cfg, code) {
  /* An EMPTY typed code matches nothing, and an empty STORED code is matched
     by nothing. Both halves are needed and neither is theoretical:
     safeEqual('','') is true, so a record whose code field is missing or blank
     — a half-finished entry, a club added before its code was minted — would
     open for anybody submitting an empty string. The trigger does reject
     anything under four characters before it reaches here, but that is one
     guard, in one caller, in a different function from the door it protects.
     The door refuses on its own account. */
  if (!code) return null;

  /* TWO KINDS OF HOLDER, ONE GRANT.
     A club has a MASTER code — the one the 72 already hold — and may have
     NAMED people, each with their own. A named code grants exactly what the
     master grants: same club, same claim, so every rule and permission is
     identical. What it adds is attribution — `who` reaches the audit trail
     and the identity bar. It is not a role. Anyone needing different
     PERMISSIONS needs an account (system/roles-and-access-plan.md).

     Revoking the CLUB revokes its people with it, which is why the club
     record's flag is checked on every entry and not just its own. */
  const clubs = (cfg && cfg.clubs) || {};
  const entries = [];
  const add = (key, rec, codeRec, who, userId) => {
    entries.push({ key, rec, codeRec, who: who || "", userId: userId || "" });
  };
  Object.keys(clubs).forEach((k) => {
    const rec = clubs[k];
    if (!rec) return;
    add(k, rec, rec, "");
    const users = rec.users || {};
    Object.keys(users).forEach((id) => {
      if (users[id]) add(k, rec, users[id], users[id].name, id);
    });
  });
  if (cfg && cfg.nl) add("NL", cfg.nl, cfg.nl, "");

  return entries.find((e) =>
    !e.rec.revoked && !e.codeRec.revoked &&
    storedCode(e.codeRec) !== "" &&
    safeEqual(storedCode(e.codeRec), code)) || null;
}

/* Resolve the codes. Character-for-character the same as club-code.js's copy,
   deliberately: two doors onto one credential must never disagree about where
   it lives, and the shared test asserts they do not. One fallback left — the
   `config` wrapper — logged so production says when it answered. The per-tool
   node went with the data on 21/08/2026.

   Returns {} rather than throwing when nothing is found: an unreadable config
   must refuse everyone, not 500 on every attempt. */
async function readCodes(db, who) {
  const [clubs, nl] = await Promise.all([
    db.ref(CODES_ROOT + "/clubs").once("value"),
    db.ref(CODES_ROOT + "/nl").once("value"),
  ]);
  if (clubs.exists() || nl.exists()) {
    return { clubs: clubs.val() || {}, nl: nl.val() || null };
  }

  const wrapped = (await db.ref(CODES_ROOT + "/config").once("value")).val();
  if (wrapped && (wrapped.clubs || wrapped.nl)) {
    logger.info(who + ": codes read from the wrapped config node");
    return wrapped;
  }

  return {};
}

/* ---- Throttle ------------------------------------------------------------
   A trigger sees no source IP, so unlike the callable version this cannot rate
   limit per caller. An attacker can also mint anonymous uids freely, making a
   per-uid counter weak on its own. So both are kept, and the global one is what
   actually bounds a distributed guess:

     · per-uid : 10 failures        — stops the naive retype-forever loop
     · global  : 120 failures / 10m — bounds everyone, at a level no honest
                                      week of 72 clubs logging in comes close to

   At the global ceiling, exhausting a 31^6 space would take ~140 years, and
   every attempt still costs an anonymous signup (itself IP-throttled by
   Identity Toolkit) plus a function invocation. If the global trip ever fires
   in normal use, raise it — but look at the audit trail first. */
const MAX_UID_FAILURES = 10;
const MAX_GLOBAL_FAILURES = 120;
const GLOBAL_WINDOW_MS = 10 * 60 * 1000;

async function throttled(uid) {
  const db = admin.database();
  const [uidSnap, globalSnap] = await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).once("value"),
    db.ref(ROOT + "/rate/global").once("value"),
  ]);
  if ((uidSnap.val() || 0) >= MAX_UID_FAILURES) return true;
  const g = globalSnap.val();
  if (g && Date.now() - (g.first || 0) <= GLOBAL_WINDOW_MS && (g.n || 0) >= MAX_GLOBAL_FAILURES) {
    return true;
  }
  return false;
}

async function noteFailure(uid) {
  const db = admin.database();
  await Promise.all([
    db.ref(ROOT + "/rate/uid/" + uid).transaction((n) => (n || 0) + 1),
    db.ref(ROOT + "/rate/global").transaction((cur) => {
      if (cur === null) return { n: 1, first: Date.now() };
      if (Date.now() - (cur.first || 0) > GLOBAL_WINDOW_MS) return { n: 1, first: Date.now() };
      cur.n = (cur.n || 0) + 1;
      return cur;
    }),
  ]);
}

/* ---- The trigger --------------------------------------------------------- */
/* onValueWritten, not onValueCreated. The request path is keyed on a stable
   uid, so it is only ever a *create* the first time that user signs in. If a
   request is ever left behind — the function was down, errored, or the trigger
   was not yet delivering — every later attempt by that user is an UPDATE, and
   an onValueCreated trigger would ignore it forever. That is a permanent
   lockout for exactly the user unlucky enough to hit a blip, so it must be
   onValueWritten. Deletions (including this function's own) are ignored, which
   also keeps it loop-safe. */
exports.programmeAuth = onValueWritten(TRIGGER_OPTS, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  if (!after || !after.exists()) return;   // our own delete, or a clear — nothing to do
  const req = after.val() || {};
  const db = admin.database();

  /* Delete the request first, whatever happens next: it carries a passcode in
     plain text and there is no reason for it to outlive this invocation. */
  await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});

  const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

  try {
    /* ---- Admin path: caller is signed in on the portal ------------------ */
    if (req.admin === true) {
      const role = String(
        (await db.ref("users/" + uid + "/role").once("value")).val() || ""
      ).toLowerCase();

      if (role !== "admin" && role !== "superadmin") {
        logger.warn("programmeAuth: admin claim refused", { uid, role });
        return grant({ ok: false, error: "Programme Packs administration is admin-only." });
      }
      /* Distinct uid per admin so the audit trail names the individual, unlike
         the shared club uids below. */
      const customToken = await admin.auth()
        .createCustomToken("pp-admin-" + uid, { pClub: "*", club: "*" });
      logger.info("programmeAuth: admin granted", { uid, role });
      return grant({
        ok: true, customToken, isNL: true,
        club: { code: "*", name: "National League", division: "" },
      });
    }

    /* ---- Club path: passcode ------------------------------------------- */
    if (await throttled(uid)) {
      return grant({
        ok: false,
        error: "Too many incorrect passcodes. Try again later, or contact the National League.",
      });
    }

    const code = normCode(req.code);
    if (code.length < 4) return grant({ ok: false, error: "Enter your passcode." });

    const cfg = await readCodes(db, "programmeAuth");
    const hit = pickClub(cfg, code);

    if (!hit) {
      await noteFailure(uid);
      logger.info("programmeAuth: passcode rejected", { uid });
      return grant({ ok: false, error: "Passcode not recognised." });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});

    /* One uid per club, not per person: everyone at a club shares `pp-<CODE>`.
       Attribution is at club level anyway — all a shared passcode can honestly
       support — and it keeps the Auth user list at 73 rows, not one per
       device. */
    const customToken = await admin.auth()
      /* BOTH CLAIMS, from either door. The codes are one credential now, so a
         club that signs in here must not lose access to the Handbook, and a
         club that signs in there must not lose access to this. Minting only
         one would make the two gates fight: signInWithCustomToken REPLACES the
         session, so whichever tool you opened last would be the only one that
         worked. Additive — nothing reads `club` here yet. */
      .createCustomToken(
        /* A named holder gets their own uid so the audit names a person; a
           master-code holder keeps the shared one. Keyed on the userId rather
           than the name: two people called Dave at one club must not collapse
           into one identity, and a rename must not orphan the trail. */
        hit.userId ? "pp-" + hit.key + "-" + hit.userId : "pp-" + hit.key,
        (() => {
          const c = { pClub: hit.key, club: hit.key };
          if (hit.who) c.who = hit.who;
          return c;
        })()
      );

    /* The person's name is not logged — the club key and a timestamp answer
       everything this log is asked. */
    logger.info("programmeAuth: club granted", { club: hit.key, named: !!hit.userId });
    return grant({
      ok: true,
      customToken,
      isNL: hit.key === "NL",
      who: hit.who || "",
      club: {
        code: hit.key,
        name: hit.rec.name || (hit.key === "NL" ? "National League" : hit.key),
        division: hit.rec.division || "",
      },
    });
  } catch (err) {
    logger.error("programmeAuth failed", { uid, message: err && err.message });
    /* Always leave a grant behind — the client waits on this node, and a silent
       failure would hang the gate until its timeout rather than saying so. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});
