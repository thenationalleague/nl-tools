/**
 * NL Tools — account-lifecycle callables (server-minted roles).
 *
 * These three callables replace the login page's client-side writes to
 * `users/<uid>` so that a user's ROLE is only ever written server-side:
 *
 *   consumeInvite         — invite acceptance. Verifies the caller's Firebase
 *                           token, atomically claims the invite (email match,
 *                           unused, unexpired), then writes the user record
 *                           with the role the ADMIN put on the invite.
 *   submitAccessRequest   — club request-access flow. Creates the user record
 *                           with role hard-coded to 'club' + pending:true and
 *                           queues the admin/requests entry. The client can no
 *                           longer choose its own role.
 *   withdrawAccessRequest — a PENDING requester withdraws: deletes their user
 *                           record, their requests entries, and their Auth
 *                           account. Active (approved) users cannot self-delete.
 *
 * Why: Firebase email/password signup is open (public API key), so RTDB rules
 * previously had to allow a client to create its own users/<uid> record —
 * which meant a self-signer could claim role 'staff'. With these callables the
 * rules drop client self-creates entirely; the Admin SDK here bypasses rules.
 * History: system/rtdb/SECURITY-role-self-grant.md, ported from gas/Invite.gs
 * v1.3 (the GAS consumeInvite was reverted because the Workspace blocks
 * anonymous Apps Script access — Functions have no such gate).
 *
 * Auth model: `request.auth` is verified by the Functions SDK before our code
 * runs. The caller's email comes from the verified token, never from the body.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

const CALL_OPTS = {
  cors: ["https://nl.tools", "https://thenationalleague.github.io"],
  memory: "256MiB",
  maxInstances: 5,
  /* Run as the Firebase Admin SDK service account: the gen-2 default (the
     compute SA) holds no Firebase roles, so RTDB revokes its connection
     ("Error: disconnect" via onAuthRevoked_, seen live 25/07/2026) and Auth
     deletes would fail too. This SA carries RTDB + Auth Admin + Storage. */
  serviceAccount: "firebase-adminsdk-fbsvc@nl-tools.iam.gserviceaccount.com",
};

// RTDB keys may not contain . # $ / [ ]
const BAD_KEY = /[.#$/\[\]]/;

function cleanStr(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 200);
}

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return {
    uid: request.auth.uid,
    email: String(request.auth.token.email || "").toLowerCase(),
  };
}

/* ---- consumeInvite ------------------------------------------------------- */
exports.consumeInvite = onCall(CALL_OPTS, async (request) => {
  const caller = requireAuth(request);
  const token = cleanStr(request.data && request.data.token, 100);
  if (!token || BAD_KEY.test(token)) {
    throw new HttpsError("invalid-argument", "Missing or invalid invite token.");
  }

  const db = admin.database();
  const invRef = db.ref("admin/invites/" + token);

  // Atomically claim the invite — guards double-use races. usedBy lets a retry
  // by the SAME user complete idempotently (e.g. network drop after the claim
  // but before the user record write landed on their screen).
  logger.info("consumeInvite: start", { uid: caller.uid });

  // RTDB transaction quirk: the callback first runs against the LOCAL cache,
  // which is null on a cold function. Returning the null unchanged commits a
  // no-op and forces a re-run against real server data — returning undefined
  // there would abort the claim before ever seeing the invite.
  const tx = await invRef.transaction((cur) => {
    if (cur === null) return cur; // cache miss — force server round-trip
    if (cur.used === true) return; // abort — already used
    if (String(cur.email || "").toLowerCase() !== caller.email) return; // abort — wrong email
    if (cur.expiresAt && Date.now() > new Date(cur.expiresAt).getTime()) return; // abort — expired
    cur.used = true;
    cur.usedBy = caller.uid;
    cur.usedAt = Date.now();
    return cur;
  });
  logger.info("consumeInvite: claim done", { committed: tx.committed, exists: tx.snapshot.exists() });

  let invite;
  if (tx.committed) {
    invite = tx.snapshot.val();
    if (!invite) {
      // The no-op path committed against a genuinely absent node.
      throw new HttpsError("not-found", "Invite not found. Please use the link from your invite email.");
    }
  } else {
    // Claim failed — work out why, allowing the idempotent-retry case through.
    const snap = await invRef.once("value");
    const cur = snap.val();
    if (!cur) {
      throw new HttpsError("not-found", "Invite not found. Please use the link from your invite email.");
    }
    if (cur.used === true && cur.usedBy === caller.uid) {
      invite = cur; // same user retrying after a partial failure — let them finish
    } else if (cur.used === true) {
      throw new HttpsError("failed-precondition", "This invite link has already been used.");
    } else if (String(cur.email || "").toLowerCase() !== caller.email) {
      throw new HttpsError("permission-denied", "This invite was issued to a different email address.");
    } else {
      throw new HttpsError("deadline-exceeded", "This invite link has expired. Please ask for a new invite.");
    }
  }

  // Server-minted user record. The role is trusted because it came from an
  // admin-minted invite (sendInvite gates who may mint which roles).
  // Create-only: if a record already exists (an established user clicked an
  // invite link, or a retry raced), leave it untouched — invites create
  // accounts, they never rewrite existing ones (admins edit roles in the
  // portal). The invite is still consumed above.
  const existingUser = (await db.ref("users/" + caller.uid).once("value")).val();
  if (existingUser) {
    logger.info("consumeInvite: user record already exists, left untouched", { uid: caller.uid });
    return { ok: true, existing: true };
  }
  await db.ref("users/" + caller.uid).set({
    name: cleanStr(invite.name),
    email: caller.email,
    role: cleanStr(invite.role) || "staff",
    org: cleanStr(invite.org),
    orgKey: cleanStr(invite.orgKey),
    club: cleanStr(invite.club),
    // Invites historically store the free-text title as clubRole; older code
    // looked for jobTitle. Accept either so no invite loses its title.
    jobTitle: cleanStr(invite.jobTitle) || cleanStr(invite.clubRole),
    pending: false,
    tools: invite.tools && typeof invite.tools === "object" ? invite.tools : {},
  });

  // Best-effort: clear matching pending-invite records (admin UI list).
  try {
    const snap = await db.ref("admin/invites-pending").once("value");
    const updates = {};
    snap.forEach((child) => {
      const e = String((child.val() && child.val().email) || "").toLowerCase();
      if (e === caller.email) updates[child.key] = null;
    });
    if (Object.keys(updates).length) {
      await db.ref("admin/invites-pending").update(updates);
    }
  } catch (err) {
    logger.warn("invites-pending cleanup failed: " + (err && err.message));
  }

  logger.info("Invite consumed", { uid: caller.uid, role: invite.role || "staff" });
  return { ok: true };
});

/* ---- submitAccessRequest ------------------------------------------------- */
exports.submitAccessRequest = onCall(CALL_OPTS, async (request) => {
  const caller = requireAuth(request);
  const data = request.data || {};

  const name = cleanStr(data.name, 120);
  const club = cleanStr(data.club, 120);
  const jobTitle = cleanStr(data.jobTitle, 120);
  if (!name || !club || !jobTitle) {
    throw new HttpsError("invalid-argument", "Name, club and role at club are required.");
  }

  // Requested tools: keys sanitised, values forced to 'access' — the client
  // cannot request admin. Admins grant levels on approval.
  const tools = {};
  const rawTools = data.tools && typeof data.tools === "object" ? data.tools : {};
  Object.keys(rawTools).slice(0, 50).forEach((k) => {
    if (k && k.length <= 60 && !BAD_KEY.test(k)) tools[k] = "access";
  });

  const db = admin.database();
  const uref = db.ref("users/" + caller.uid);
  const existing = (await uref.once("value")).val();
  if (existing && existing.pending !== true) {
    throw new HttpsError("already-exists", "An account already exists for this user.");
  }
  // (existing && pending===true) falls through: idempotent retry of a
  // partially-completed submission.

  await uref.set({
    name,
    email: caller.email,
    role: "club", // hard-coded server-side — never taken from the client
    org: "",
    orgKey: "club",
    club,
    jobTitle,
    pending: true,
    tools,
  });

  // Ensure exactly one open admin/requests entry for this uid.
  const reqsSnap = await db.ref("admin/requests").once("value");
  let already = false;
  reqsSnap.forEach((child) => {
    const v = child.val();
    if (v && v.uid === caller.uid && v.status === "pending") already = true;
  });
  if (!already) {
    await db.ref("admin/requests").push({
      uid: caller.uid,
      name,
      email: caller.email,
      club,
      jobTitle,
      tools,
      role: "club",
      status: "pending",
      createdAt: Date.now(),
    });
  }

  logger.info("Access request submitted", { uid: caller.uid, club });
  return { ok: true };
});

/* ---- withdrawAccessRequest ----------------------------------------------- */
exports.withdrawAccessRequest = onCall(CALL_OPTS, async (request) => {
  const caller = requireAuth(request);
  const db = admin.database();

  const snap = await db.ref("users/" + caller.uid).once("value");
  const user = snap.val();
  if (user && user.pending !== true) {
    // Approved/active accounts are removed by admins in the portal, not here.
    throw new HttpsError("failed-precondition", "Only a pending request can be withdrawn.");
  }

  await db.ref("users/" + caller.uid).remove();

  // Drop this uid's request entries (small node — read and match).
  try {
    const reqsSnap = await db.ref("admin/requests").once("value");
    const updates = {};
    reqsSnap.forEach((child) => {
      const v = child.val();
      if (v && v.uid === caller.uid) updates[child.key] = null;
    });
    if (Object.keys(updates).length) {
      await db.ref("admin/requests").update(updates);
    }
  } catch (err) {
    logger.warn("requests cleanup failed: " + (err && err.message));
  }

  // Delete the Auth account last — after this the caller's token is dead.
  await admin.auth().deleteUser(caller.uid);

  logger.info("Access request withdrawn", { uid: caller.uid });
  return { ok: true };
});
