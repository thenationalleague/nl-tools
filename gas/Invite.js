/* =========================================================================
   invite.gs — Invite token generation + send
   Version: 1.5 (idempotent send)
   Date: 15/09/2026

   In-repo mirror of the Apps Script file (keep in lockstep with the live
   project).

   CHANGELOG
   v1.5 — sendInvite is now idempotent on the invite token, so a retry cannot
          send a second email. The portal (v5.123) mints the token and retries
          the same call when Google drops the reply on the googleusercontent
          relay hop — an intermittent 404 that fires AFTER this function has
          already written the record and sent the mail, which is why those
          "failures" still delivered. The record now carries `emailed`: a
          retry that finds the token already emailed returns ok and sends
          nothing; one that finds the record but no confirmed email (a crash
          between write and send) sends once and marks it. Callers that send no
          token still work unchanged — one is generated and, with no retry,
          the behaviour is exactly as before.
   v1.4 — Removed validateInvite() and consumeInvite() (+ consumePendingInvite_).
          Invite acceptance moved to the Cloud Function consumeInvite
          (functions/account.js); these GAS routes had no live caller but stayed
          reachable on the public /exec URL, duplicating a secret-holding user
          write. sendInvite() is all that remains here.
   v1.3 — consumeInvite(): the invite-acceptance page now writes the user record
          (incl. role/tools) HERE, server-side, with the RTDB secret — the client
          no longer self-asserts its role. Verifies the ID token + invite (email
          match, unused, unexpired) first. See system/rtdb/SECURITY-role-self-grant.md.
   v1.2 — sendInvite requires a verified league admin (idToken); only a superadmin
          may mint an admin/superadmin invite. See verifyCaller_ in utils.gs.
   v1.1 — RTDB paths: /invites/ → /admin/invites/
   v1.0 — Initial build
   ========================================================================= */

/* ---- Send invite --------------------------------------------------------- */
function sendInvite(body) {
  /* AuthZ: league admins only may invite; only a superadmin may mint an
     admin/superadmin invite (no privilege escalation via invite). */
  var caller = verifyCaller_(body.idToken);
  if (!caller.ok) return { ok: false, error: caller.error };
  if (caller.user.role !== 'admin' && caller.user.role !== 'superadmin') {
    return { ok: false, error: 'Admins only.' };
  }
  var wantRole = String(body.role || '').trim();
  if ((wantRole === 'admin' || wantRole === 'superadmin') &&
      caller.user.role !== 'superadmin') {
    return { ok: false, error: 'Only a superadmin can invite an admin or superadmin.' };
  }

  var email    = String(body.email    || '').trim().toLowerCase();
  var name     = String(body.name     || '').trim();
  var role     = String(body.role     || '').trim();
  var org      = String(body.org      || '').trim();
  var club     = String(body.club     || '').trim();
  var clubRole = String(body.clubRole || '').trim();

  if (!email) return { ok: false, error: 'Email is required.' };
  if (!isValidEmail(email)) return { ok: false, error: 'Invalid email address.' };

  var config = getConfig();
  if (!config.continueUrl) return { ok: false, error: 'FIREBASE_CONTINUE_URL not set.' };
  if (!config.senderAlias) return { ok: false, error: 'SENDER_ALIAS not set.' };
  if (!config.rtdbUrl)     return { ok: false, error: 'RTDB_URL not set.' };

  /* Idempotency key. The portal mints this and retries the same call when the
     googleusercontent relay drops the reply (an intermittent 404 that fires
     AFTER we have already run). We key on it so a retry never double-sends.
     A caller that omits it gets a fresh one and, with no retry, the old
     behaviour. Constrained to UUID characters so it is only ever an RTDB leaf
     name, never a path. */
  var token = String(body.token || '').trim();
  if (!/^[0-9a-fA-F-]{8,64}$/.test(token)) token = Utilities.getUuid();

  var recordUrl = config.rtdbUrl + '/admin/invites/' + token + '.json';
  var existing  = rtdbRead(recordUrl, config.rtdbSecret);
  if (existing.ok && existing.data && existing.data.emailed) {
    /* A retry of a call that already completed: the mail went, do not resend. */
    return { ok: true, token: token, already: true };
  }

  var now     = new Date();
  var expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  var prior   = (existing.ok && existing.data) ? existing.data : null;
  var record  = {
    email:     email,
    name:      name,
    role:      String(body.role     || 'staff'),
    org:       String(body.org      || ''),
    orgKey:    String(body.orgKey   || ''),
    club:      String(body.club     || ''),
    clubRole:  String(body.clubRole || ''),
    tools:     body.tools || {},
    /* Preserve original timestamps / used-state if this token was written by a
       first attempt whose reply was lost, so a retry does not reset the clock
       or un-accept an invite. */
    createdAt: (prior && prior.createdAt) || now.toISOString(),
    expiresAt: (prior && prior.expiresAt) || expires.toISOString(),
    used:      (prior && prior.used) || false,
    emailed:   false
  };

  var writeResult = rtdbWrite(recordUrl, record, config.rtdbSecret);
  if (!writeResult.ok) return { ok: false, error: 'Failed to store invite token: ' + writeResult.error };

  var inviteLink = config.continueUrl
    + '?invite=' + encodeURIComponent(token)
    + '&email='  + encodeURIComponent(email);

  var orgLine = role === 'club'
    ? (club + (clubRole ? ', ' + clubRole : ''))
    : (org  + (role     ? ' — ' + capitalise(role) : ''));

  MailApp.sendEmail({
    to:       email,
    subject:  'You\'ve been invited to NL Tools',
    body:     buildInviteEmailText(name, orgLine, inviteLink),
    htmlBody: buildInviteEmail(name, orgLine, inviteLink),
    name:     config.senderName,
    from:     config.senderAlias
  });

  /* Mark the send confirmed, so any later retry of this token stops at the
     early return above rather than sending again. rtdbWrite is a PUT (whole
     node), and we hold the full record, so this just flips one field. */
  record.emailed = true;
  rtdbWrite(recordUrl, record, config.rtdbSecret);

  Logger.log('Invite sent to ' + email);
  return { ok: true, token: token };
}
