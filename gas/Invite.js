/* =========================================================================
   invite.gs — Invite token generation + send
   Version: 1.4 (dead routes removed)
   Date: 16/08/2026

   In-repo mirror of the Apps Script file (keep in lockstep with the live
   project).

   CHANGELOG
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

  var token   = Utilities.getUuid();
  var now     = new Date();
  var expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  var writeResult = rtdbWrite(
    config.rtdbUrl + '/admin/invites/' + token + '.json',
    {
      email:     email,
      name:      name,
      role:      String(body.role     || 'staff'),
      org:       String(body.org      || ''),
      orgKey:    String(body.orgKey   || ''),
      club:      String(body.club     || ''),
      clubRole:  String(body.clubRole || ''),
      tools:     body.tools || {},
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      used:      false
    },
    config.rtdbSecret
  );

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

  Logger.log('Invite sent to ' + email);
  return { ok: true };
}
