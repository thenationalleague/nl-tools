/* =========================================================================
   invite.gs — Token generation + validation + consumption
   Version: 1.3 (server-side role write)
   Date: 17/07/2026

   In-repo mirror of the Apps Script file (keep in lockstep with the live
   project).

   CHANGELOG
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

/* ---- Validate invite token (unchanged from live) ------------------------- */
function validateInvite(body) {
  var token = String(body.token || '').trim();
  var email = String(body.email || '').trim().toLowerCase();

  if (!token || !email) return { ok: false, error: 'Token and email required.' };

  var config = getConfig();
  if (!config.rtdbUrl) return { ok: false, error: 'RTDB_URL not configured.' };

  var result = rtdbRead(config.rtdbUrl + '/admin/invites/' + token + '.json', config.rtdbSecret);
  if (!result.ok)   return { ok: false, error: 'Could not read invite: ' + result.error };
  if (!result.data) return { ok: false, error: 'Invite not found or already used.' };

  var invite = result.data;
  if ((invite.email || '').toLowerCase() !== email) return { ok: false, error: 'Email does not match this invite.' };
  if (invite.used === true) return { ok: false, error: 'This invite link has already been used.' };

  var now     = new Date();
  var expires = new Date(invite.expiresAt);
  if (now > expires) return { ok: false, error: 'This invite link has expired. Please request a new invite.' };

  rtdbWrite(config.rtdbUrl + '/admin/invites/' + token + '/used.json', true, config.rtdbSecret);

  return {
    ok:       true,
    name:     invite.name     || '',
    role:     invite.role     || 'staff',
    org:      invite.org      || '',
    orgKey:   invite.orgKey   || '',
    club:     invite.club     || '',
    clubRole: invite.clubRole || '',
    tools:    invite.tools    || {}
  };
}

/* ---- Consume invite (server-side role write) ----------------------------- */
/* Called by the acceptance page AFTER the invitee has created their Firebase
   account. Verifies the caller's ID token, re-validates the invite (email match,
   unused, unexpired), then writes the user record (incl. role/tools) with the
   RTDB secret and marks the invite used. This is the ONLY path that sets a role
   for an invited user — the client never writes its own role. */
function consumeInvite(body) {
  var token = String(body.token || '').trim();
  if (!token) return { ok: false, error: 'Missing invite token.' };

  /* Who is calling? uid + email straight from the verified token (no profile
     yet — it's being created here). */
  var ident = verifyIdentity_(body.idToken);
  if (!ident.ok) return { ok: false, error: ident.error };

  var config = getConfig();
  if (!config.rtdbUrl) return { ok: false, error: 'RTDB_URL not set.' };

  var res = rtdbRead(config.rtdbUrl + '/admin/invites/' + token + '.json', config.rtdbSecret);
  if (!res.ok)   return { ok: false, error: 'Could not read invite: ' + res.error };
  var invite = res.data;
  if (!invite)              return { ok: false, error: 'Invite not found or already used.' };
  if (invite.used === true) return { ok: false, error: 'This invite has already been used.' };

  var invEmail  = String(invite.email || '').toLowerCase();
  var tokenMail = String(ident.email  || '').toLowerCase();
  if (!invEmail || invEmail !== tokenMail) {
    return { ok: false, error: 'This invite was issued to a different email address.' };
  }
  if (invite.expiresAt && (new Date() > new Date(invite.expiresAt))) {
    return { ok: false, error: 'This invite has expired. Please ask for a new one.' };
  }

  /* Write the user record with the secret (bypasses rules). The role is trusted:
     it came from an admin-minted invite, gated by sendInvite. */
  var w = rtdbWrite(config.rtdbUrl + '/users/' + ident.uid + '.json', {
    name:     invite.name     || '',
    email:    tokenMail,
    role:     invite.role     || 'staff',
    org:      invite.org      || '',
    orgKey:   invite.orgKey   || '',
    club:     invite.club     || '',
    jobTitle: invite.jobTitle || '',
    pending:  false,
    tools:    invite.tools    || {}
  }, config.rtdbSecret);
  if (!w.ok) return { ok: false, error: 'Could not create your account record: ' + w.error };

  /* Mark the invite used, and clear any matching pending-invite record. */
  rtdbWrite(config.rtdbUrl + '/admin/invites/' + token + '/used.json', true, config.rtdbSecret);
  consumePendingInvite_(config, invEmail);

  return { ok: true };
}

/* Remove any admin/invites-pending entries for this email (best-effort). */
function consumePendingInvite_(config, email) {
  try {
    var res = rtdbRead(config.rtdbUrl + '/admin/invites-pending.json', config.rtdbSecret);
    if (!res.ok || !res.data) return;
    Object.keys(res.data).forEach(function(key) {
      var e = String((res.data[key] && res.data[key].email) || '').toLowerCase();
      if (e === email) rtdbWrite(config.rtdbUrl + '/admin/invites-pending/' + key + '.json', null, config.rtdbSecret);
    });
  } catch (e) { /* best-effort */ }
}
