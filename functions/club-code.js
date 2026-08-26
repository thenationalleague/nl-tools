/**
 * NL Tools — one club code → a `club` claim (RTDB-triggered).
 *
 * WHAT THIS IS
 * ------------
 * The single credential a club uses for every club-facing gated tool. Type a
 * six-character code, get back a Firebase custom token carrying `club: '<key>'`
 * — the club's key from clubs-meta, the same vocabulary `pClub` already speaks.
 *
 * The code says WHICH CLUB. It does not say what that club may open: that is
 * decided per tool in the RTDB rules, which read the claim. Adding a third tool
 * means extending rules, not minting a third set of 72 codes.
 *
 * WHY IT EXISTS (system/club-code-plan.md)
 * ----------------------------------------
 * Two sets of 72 codes already existed before this — Programme Packs
 * (`media-programme/config.clubs`) and Club Directory (`ops-club-directory/
 * config.readers`) — and the Handbook would have made three. Settled
 * 19/08/2026: one code per club, resettable per club, covering all of them.
 *
 * The Directory is the reason the claim carries a CLUB rather than a role. Its
 * own `dir: 'reader'|'editor'|'admin'` claim says what kind of visitor you are
 * and not which club, which is exactly why it cannot show a club its own
 * withheld-contact markers and nobody else's. A club-shaped claim is not
 * tidiness; it is the mechanism that feature needs.
 *
 * THE PROGRAMME CODES, RELOCATED  (decided 21/08/2026)
 * ----------------------------------------------------
 * This file first said "fresh codes, not the Programme ones", on the grounds
 * that a code handed out for matchday artwork should not silently become a key
 * to a staff directory. That was overruled deliberately, and the reason is
 * worth keeping: the Programme codes are IN THE WILD across 72 clubs, and
 * reissuing them to gain a cleaner history would have meant 72 conversations
 * and a long tail of people holding a code that no longer works. One
 * credential, moved rather than replaced. The widening is the decision, taken
 * once, rather than an accident.
 *
 * Both claims are minted from both doors, so a club that signs in at either
 * tool stays signed in at the other — signInWithCustomToken replaces the
 * session, so minting one would make the two gates fight.
 *
 * THE SHAPE OF THE RECORDS  (never client-readable except by an admin)
 * -------------------------------------------------------------------
 *   clubs/<clubKey> = { name, passcode | code, revoked?, rotatedAt?,
 *                       users?: { <id>: { name, code, revoked? } } }
 *   nl              = the same shape, users and all → claim 'club: "NL"'
 *
 * THAT LAST LINE SAID 'club: "*"' AND THE CODE HAS NEVER MINTED IT. A code
 * holder gets `club: <key>`, so the NL record's holders get `club: "NL"`.
 * The wildcard is minted only on the staff path below, from a signed-in
 * portal account whose role is checked server-side — which is the point:
 * `pClub: "*"` is Programme Packs administration, and handing it to anyone
 * holding a typed code would give a code the thing that door refuses to a
 * staff account. `club: "NL"` reads everything gated on `club != null`
 * (the handbook, the directory) and matches no club where a rule compares
 * the claim to a club key, which is the correct answer for a viewer who is
 * not a club. Left as it is, and now written down as it is.
 *
 * `passcode` is what the Programme console has always written and `code` is
 * the club-codes vocabulary; both are read. See readCodes() for where they
 * live and storedCode() for the field names.
 *
 * `revoked: true` is preferred over deleting a record, so an audit line still
 * resolves a departed club's uid to a name rather than showing a bare key.
 *
 * REVOCATION IS NOT INSTANT. A custom claim lives in the holder's token until
 * it refreshes — up to an hour. Resetting a code stops the NEXT sign-in, not
 * the session already open. Any UI offering "reset" must not imply otherwise.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No editor/admin level. This grants read-shaped club identity and nothing
 * else; the Directory's editor codes stay where they are until someone decides
 * that editing should ride on a shared club credential, which is a different
 * question from reading (plan §7.4).
 */

"use strict";

const { onValueWritten } = require("firebase-functions/v2/database");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const ROOT = "app-data/club-codes";

const TRIGGER_OPTS = {
  ref: "/" + ROOT + "/authRequests/{uid}",
  instance: "nl-tools-default-rtdb",
  /* RTDB triggers must run in the database's region (europe-west1), which
     overrides the europe-west2 setGlobalOptions default in index.js. */
  region: "europe-west1",
  memory: "256MiB",
  maxInstances: 10,
  /* The gen-2 default (compute SA) holds no Firebase roles, so RTDB drops its
     connection and token minting fails. Same account as the others. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

/* Codes come off an email or a printed sheet and get retyped, so match on the
   normalised form: uppercase, alphanumerics only. Identical to programme.js's
   normCode — tests/club-code.test.mjs asserts the two agree, because a club
   holding one code for both tools must not find it works in one and not the
   other over a typed space. */
function normCode(s) {
  return String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* Constant-time-ish compare — removes the trivial early-exit timing signal.
   The code space plus the throttle below is the real defence. */
function safeEqual(a, b) {
  a = String(a || ""); b = String(b || "");
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Which club does this code open? The code alone is the whole credential —
   no link token narrowing the search. Programme Packs carried one and it cost
   a club a day of "Passcode not recognised" on a correct new passcode, because
   rotating the code rotated the token in every bookmark alongside it. The
   collision that token guarded is prevented at issue time instead: the console
   refuses to mint a code another club already holds. */
/* The stored field is `passcode` on the relocated Programme records and `code`
   on anything minted since. Both are read, because the relocation is a move
   rather than a rewrite: renaming 72 live secrets in flight is a second thing
   to go wrong for no benefit, and a record that opens under one name and not
   the other is the worst possible outcome of tidying. */
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
     record's flag is checked on every entry and not just its own.

     THE NL RECORD IS A HOLDER LIKE ANY OTHER, and until 22/08/2026 it was
     not. The club loop walked `rec.users`; the NL record was added by a
     separate one-line branch that added the master code and stopped. So a
     named person created under National League in the club-codes console —
     written to app-data/club-codes/nl/users/<id>, the same shape as a club's
     — matched nothing here, was rejected as an unrecognised code, and the
     gate simply asked again. Reported live: "their code doesn't open
     club-directory/reader. it loops back to Enter your six-digit code."

     Which is why the walk is a function called twice rather than a loop plus
     a special case. The special case is what drifted. */
  const entries = [];
  const add = (key, rec, codeRec, who, userId) => {
    entries.push({ key, rec, codeRec, who: who || "", userId: userId || "" });
  };
  const addHolder = (key, rec) => {
    if (!rec) return;
    add(key, rec, rec, "");
    const users = rec.users || {};
    Object.keys(users).forEach((id) => {
      if (users[id]) add(key, rec, users[id], users[id].name, id);
    });
  };
  const clubs = (cfg && cfg.clubs) || {};
  Object.keys(clubs).forEach((k) => addHolder(k, clubs[k]));
  addHolder("NL", cfg && cfg.nl);

  return entries.find((e) =>
    !e.rec.revoked && !e.codeRec.revoked &&
    storedCode(e.codeRec) !== "" &&
    safeEqual(storedCode(e.codeRec), code)) || null;
}

/* ---- Where the codes live ------------------------------------------------
   CANONICAL: app-data/club-codes/clubs/<KEY> and app-data/club-codes/nl.

   The node is already called club-codes, so wrapping the records in a further
   `config` level named nothing the path did not already say — and when the 73
   live records were moved in they landed at the shorter path, which is the
   shape that has to be right rather than the one that reads best in a plan.
   Both functions looked only in the wrapper, found nothing, and refused every
   club in the estate (21/08/2026). Accepting where the data is beats moving
   73 live secrets by hand to suit a level of nesting.

   One fallback left: the `config/` wrapper, for anything written under it,
   logged so production says when it answered. The per-tool media-programme
   node went with the data — Richard deleted it on 21/08/2026, confirmed, so
   the branch reading it was a place a code could hide and nothing more.

   Returns {} rather than throwing when nothing is found: an unreadable config
   must refuse everyone, not 500 on every attempt. */
async function readCodes(db, who) {
  const [clubs, nl] = await Promise.all([
    db.ref(ROOT + "/clubs").once("value"),
    db.ref(ROOT + "/nl").once("value"),
  ]);
  if (clubs.exists() || nl.exists()) {
    return { clubs: clubs.val() || {}, nl: nl.val() || null };
  }

  const wrapped = (await db.ref(ROOT + "/config").once("value")).val();
  if (wrapped && (wrapped.clubs || wrapped.nl)) {
    logger.info(who + ": codes read from the wrapped config node");
    return wrapped;
  }

  return {};
}

/* ---- Usage log -----------------------------------------------------------

   WHO USED A CODE, WHEN, AND WHICH TOOL THEY OPENED WITH IT.

   Until now: nothing. Both doors minted a token and returned. The comments in
   this file talk about the audit trail naming a person — and the trail was
   never written, so every club-code sign-in since launch is unrecorded and
   cannot be recovered. This starts the record; it does not backdate it.

   WHAT IS STORED, AND WHAT IS NOT. The userId, never the person's name. The
   name already lives one node away in the code record, so writing it here
   would be a second copy that goes stale the moment someone is renamed — the
   admin page resolves it at display time instead. The CODE is never written,
   here or anywhere: a log holding the credential it logs the use of is a
   second place to steal it from.

   FLAT, not nested under the club. "The last 200 sign-ins across the estate"
   is the question this gets asked, and under usage/<club>/<push> that means
   reading every entry ever written and sorting in the browser —
   limitToLast on the parent returns the last CLUBS, not the last uses. Flat
   with the club as a field, indexed on `at`, makes it one bounded query.

   ONE ENTRY PER SUCCESSFUL SIGN-IN. A failed
   attempt is not a use and stays out of it — the throttle already counts
   those, and mixing "someone got in" with "someone tried" makes the useful
   list unreadable.

   It grows without a ceiling. At the estate's rate that is a few thousand rows
   a year, which RTDB does not notice, and trimming on write would cost a read
   on every sign-in to save nothing anyone is short of. Worth a cap the day
   someone wants a year-on-year view rather than a recent one. */
function noteUse(db, key, detail) {
  if (!key) return Promise.resolve();
  const entry = {
    club: key,
    at: admin.database.ServerValue.TIMESTAMP,
    tool: cleanTool(detail && detail.tool),
    userId: (detail && detail.userId) || "",
  };
  /* Fire and forget. A club that has typed the right code is signing in
     whatever the log does — failing the grant because an audit write failed
     would turn a record-keeping problem into a lockout. */
  return db.ref(ROOT + "/usage").push(entry).catch((err) => {
    logger.warn("clubCodeAuth: usage not recorded", {
      club: key, message: err && err.message,
    });
  });
}

/* The tool name comes off the client, so it is untrusted text on its way to a
   node an admin reads. Lowercase letters and dashes, short, or nothing —
   an unknown tool is better recorded as blank than as whatever was sent. */
function cleanTool(t) {
  const s = String(t == null ? "" : t).toLowerCase().replace(/[^a-z-]/g, "");
  return s.slice(0, 24);
}

/* ---- Throttle ------------------------------------------------------------
   A trigger sees no source IP, so this cannot rate limit per caller, and an
   attacker can mint anonymous uids freely — which makes a per-uid counter weak
   on its own. Both are kept, and the global one is what actually bounds a
   distributed guess:

     · per-uid : 10 failures        — stops the naive retype-forever loop
     · global  : 120 failures / 10m — bounds everyone, at a level no honest
                                      week of 72 clubs signing in comes close to

   If the global trip ever fires in normal use, raise it — but read the audit
   trail first. Deliberately the same numbers as programme.js: two gates with
   the same job and different ceilings is a difference someone has to hold in
   their head for no benefit. */
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

/* ---- The trigger ---------------------------------------------------------
   onValueWritten, not onValueCreated. The request path is keyed on a stable
   uid, so it is only ever a *create* the first time that user signs in. If a
   request is left behind — the function was down, errored, or the trigger was
   not yet delivering — every later attempt by that user is an UPDATE, and an
   onValueCreated trigger would ignore it forever. That is a permanent lockout
   for exactly the user unlucky enough to hit a blip. Deletions (including this
   function's own) are ignored, which also keeps it loop-safe. */
exports.clubCodeAuth = onValueWritten(TRIGGER_OPTS, async (event) => {
  const uid = event.params.uid;
  const after = event.data && event.data.after;
  if (!after || !after.exists()) return;   // our own delete, or a clear
  const req = after.val() || {};
  const db = admin.database();

  /* Delete the request first, whatever happens next: it carries a code in
     plain text and there is no reason for it to outlive this invocation. */
  await db.ref(ROOT + "/authRequests/" + uid).remove().catch(() => {});

  const grant = (payload) => db.ref(ROOT + "/authGrants/" + uid).set(payload);

  try {
    /* ---- NL path: caller is already signed in on the portal -------------
       Staff open these tools from the portal and should not be typing a club
       code to do it. `club: "*"` is the same SHAPE of wildcard pClub uses, so
       a rule written for one reads the other without a second branch — but
       they are not the same grant, and which claims get minted depends on the
       role. See below. */
    if (req.staff === true) {
      const role = String(
        (await db.ref("users/" + uid + "/role").once("value")).val() || ""
      ).toLowerCase();

      if (role !== "staff" && role !== "admin" && role !== "superadmin") {
        logger.warn("clubCodeAuth: staff claim refused", { uid, role });
        return grant({ ok: false, error: "This needs a National League account." });
      }
      /* `pClub: "*"` is NOT the same grant as `club: "*"`, and this door must
         not hand out both to everyone who reaches it.

         `club` is the club-facing wildcard: see every club, edit nothing,
         which is what an NL staff account already means everywhere else.
         `pClub` is Programme Packs ADMINISTRATION — write into all 73
         folders, and read the config holding every club's passcode. The
         programmeAuth door has always held that to admin/superadmin ("Programme
         Packs administration is admin-only"), and minting both here would have
         quietly handed a staff account the thing that door refuses them,
         through a different tool's sign-in.

         So: staff get the club wildcard, admins get both. Nothing calls the
         staff path yet — codeGate.openAsAdmin sends `admin`, not `staff` — so
         this is closing the hole before anything falls in it.

         Distinct uid per person, unlike the shared club uids below: a named
         account is signing in, so the audit trail can name them. */
      const claims = (role === "admin" || role === "superadmin")
        ? { club: "*", pClub: "*" }
        : { club: "*" };
      const customToken = await admin.auth()
        .createCustomToken("cc-staff-" + uid, claims);
      logger.info("clubCodeAuth: staff granted", { uid, role });
      return grant({
        ok: true, customToken, isNL: true,
        role: "*", name: "National League",
        club: { code: "*", name: "National League" },
      });
    }

    /* ---- Club path: the code -------------------------------------------- */
    if (await throttled(uid)) {
      return grant({
        ok: false,
        error: "Too many incorrect codes. Try again later, or contact the National League.",
      });
    }

    const code = normCode(req.code);
    /* ACCESS CODE, not club code: the same six characters are held by the 72
       clubs AND by named people at the League, and the League is not a club.
       The cards were corrected on 22/08/2026 and this string was missed —
       the server writes the message on every failed attempt, so the old
       wording survived where it is most visible. */
    if (code.length < 4) return grant({ ok: false, error: "Enter your access code." });

    /* Same records Programme reads — one credential, one home, two doors. */
    const cfg = await readCodes(db, "clubCodeAuth");
    const hit = pickClub(cfg, code);

    if (!hit) {
      await noteFailure(uid);
      /* The code itself is never logged, on the rejected path least of all —
         a near-miss in a log line is a near-miss written down. */
      logger.info("clubCodeAuth: code rejected", { uid });
      return grant({ ok: false, error: "Code not recognised." });
    }

    await db.ref(ROOT + "/rate/uid/" + uid).remove().catch(() => {});

    /* One uid per club, not per person: everyone at a club shares `cc-<key>`.
       Attribution is at club level anyway — all a shared code can honestly
       support — and it keeps the Auth user list at 73 rows rather than one per
       device. Anyone wanting per-person attribution wants an account, which is
       a different door (system/roles-and-access-plan.md). */
    /* BOTH CLAIMS — see the matching note in programme.js. A club signing in
       here must keep Programme Packs working, because the two gates otherwise
       fight: signInWithCustomToken replaces the session, so whichever was
       opened last would be the only one that worked. */
    /* The NAME rides in the claims too, as `<claim>Name` — the shape
       NL.codeGate.resume reads (`c[claim + 'Name']`). The grant payload
       carries it as well, but a grant is answered once and a claim survives
       every reload, so without this a returning club got an identity bar that
       had forgotten which club it was and fell back to "The National League".
       The page can resolve the key through the roster, and does; this means
       it does not have to. */
    const clubName = hit.rec.name ||
      (hit.key === "NL" ? "National League" : hit.key);

    /* A NAMED holder gets their own uid, so the audit trail names a person
       rather than a club. A master-code holder keeps the shared `cc-<key>`,
       because a shared code cannot honestly support more than club-level
       attribution and 73 rows in the Auth user list beats one per device.
       The userId, not the name, keys the uid: two people called Dave at one
       club must not collapse into one identity, and a rename must not orphan
       the trail behind it. */
    const uidFor = hit.userId ? "cc-" + hit.key + "-" + hit.userId : "cc-" + hit.key;
    const claims = {
      club: hit.key, pClub: hit.key,
      clubName: clubName, pClubName: clubName,
    };
    if (hit.who) claims.who = hit.who;

    const customToken = await admin.auth().createCustomToken(uidFor, claims);

    /* The person's NAME is not logged — it is theirs, and a club key plus a
       timestamp already answers every question this log is asked. */
    logger.info("clubCodeAuth: club granted", { club: hit.key, named: !!hit.userId });
    await noteUse(db, hit.key, { tool: req.tool, userId: hit.userId });
    /* `role` and `name` at the TOP LEVEL, because that is the shape
       NL.codeGate resolves with — codeGateExchange returns { role: g.role,
       name: g.name } and nothing else. The first version returned only the
       nested `club` object, so the reader's identity bar had nothing to read
       and fell back to "The National League" on a club's own sign-in. The
       nested object stays for callers that want the pair together. */
    return grant({
      ok: true,
      customToken,
      isNL: hit.key === "NL",
      role: hit.key,
      /* `name` stays the CLUB, always. Callers match it against a club list —
         the Directory resolves which club is reading from it — and a person's
         name there would break that quietly. `who` is the extra, not the
         replacement; a bar wanting "Ralph · AFC Fylde" composes the two. */
      name: clubName,
      who: hit.who || "",
      club: { code: hit.key, name: clubName },
    });
  } catch (err) {
    logger.error("clubCodeAuth failed", { uid, message: err && err.message });
    /* Always leave a grant behind — the client waits on this node, and a silent
       failure would hang the gate until its timeout rather than saying so. */
    return grant({ ok: false, error: "Something went wrong. Please try again." });
  }
});

/* Exported for tests. Not part of the deployed surface. */
exports._internals = { normCode, safeEqual, pickClub, ROOT };
