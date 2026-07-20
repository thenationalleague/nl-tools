/* =========================================================================
   notifications.gs — Email notifications for request flow

   In-repo mirror of the Apps Script handler (keep in lockstep with the live
   project). AuthZ (Phase 7): sendApproval / sendRejection require a verified
   league admin — they represent an admin decision. notifyAdmin / confirmRequest
   are the PRE-REGISTRATION request flow (the requester has no account yet) and
   are intentionally left open; abuse control for those is a separate follow-up
   (see gas/SECURITY-invite-authz.md). verifyCaller_ lives in Utils.gs.
   ========================================================================= */

/* ---- Notify all admins of new request ------------------------------------ */
function notifyAdmin(body) {
  var name      = String(body.name     || '').trim();
  var email     = String(body.email    || '').trim();
  var club      = String(body.club     || '').trim();
  var clubRole  = String(body.clubRole || '').trim();
  var tools     = body.tools || {};
  var portalUrl = String(body.portalUrl || '').trim();

  if (!email) return { ok: false, error: 'Email required.' };

  var config = getConfig();
  if (!config.rtdbUrl)     return { ok: false, error: 'RTDB_URL not set.' };
  if (!config.senderAlias) return { ok: false, error: 'SENDER_ALIAS not set.' };

  /* Fetch all admin/superadmin users from RTDB dynamically */
  var adminEmails = getAdminEmails(config);
  if (adminEmails.length === 0) {
    adminEmails.push(config.senderAlias);
    Logger.log('No admin users found -- falling back to SENDER_ALIAS');
  }

  var toolList  = Object.keys(tools).filter(function(k) { return tools[k] === 'access' || tools[k] === 'admin'; });
  /* Append tab param so portal auto-opens Pending Requests tab */
  var baseLink  = portalUrl || 'https://thenationalleague.github.io/tools/portal/';
  var link      = baseLink.replace(/\/?$/, '/') + '?tab=requests';
  var subject   = '[NL Tools] New access request — ' + name + (club ? ' (' + club + ')' : '');
  var htmlBody  = buildAdminNotifyEmail(name, email, club, clubRole, toolList, link);
  var textBody  =
    'A new access request has been submitted.\n\n' +
    'Name:      ' + name     + '\n' +
    'Email:     ' + email    + '\n' +
    (club     ? 'Club:      ' + club     + '\n' : '') +
    (clubRole ? 'Role:      ' + clubRole + '\n' : '') +
    (toolList.length ? 'Tools:     ' + toolList.join(', ') + '\n' : '') +
    'Time:      ' + new Date().toLocaleString('en-GB') + '\n\n' +
    'Review in the admin panel:\n' + link;

  adminEmails.forEach(function(adminEmail) {
    try {
      MailApp.sendEmail({ to: adminEmail, subject: subject, body: textBody, htmlBody: htmlBody, name: config.senderName, from: config.senderAlias });
      Logger.log('Admin notification sent to ' + adminEmail);
    } catch(err) {
      Logger.log('Failed to notify ' + adminEmail + ': ' + err.message);
    }
  });

  return { ok: true, notified: adminEmails.length };
}

/* ---- Confirm request receipt to user ------------------------------------- */
function confirmRequest(body) {
  var name  = String(body.name  || '').trim();
  var email = String(body.email || '').trim().toLowerCase();

  if (!email) return { ok: false, error: 'Email required.' };

  var config    = getConfig();
  var firstName = name ? name.split(' ')[0] : 'there';

  MailApp.sendEmail({
    to:       email,
    subject:  'Your NL Tools request has been received',
    body:     'Hi ' + firstName + ',\n\nThanks for requesting access to NL Tools.\n\n' +
              'Your request is being reviewed and you\'ll hear back shortly.\n\n' +
              'Questions? Email media@thenationalleague.org.uk\n\nThe National League',
    htmlBody: buildConfirmEmail(firstName),
    name:     config.senderName,
    from:     config.senderAlias
  });

  Logger.log('Request confirmation sent to ' + email);
  return { ok: true };
}

/* ---- Send approval email ------------------------------------------------- */
function sendApproval(body) {
  /* AuthZ: an admin decision — verified league admin/superadmin only. */
  var caller = verifyCaller_(body.idToken);
  if (!caller.ok) return { ok: false, error: caller.error };
  if (caller.user.role !== 'admin' && caller.user.role !== 'superadmin') {
    return { ok: false, error: 'Admins only.' };
  }

  var name  = String(body.name  || '').trim();
  var email = String(body.email || '').trim().toLowerCase();

  if (!email) return { ok: false, error: 'Email required.' };

  var config     = getConfig();
  var firstName  = name ? name.split(' ')[0] : 'there';
  var portalLink = config.continueUrl || 'https://thenationalleague.github.io/tools/';

  MailApp.sendEmail({
    to:       email,
    subject:  'Your NL Tools access has been approved',
    body:     'Hi ' + firstName + ',\n\nYour request to access NL Tools has been approved.\n\n' +
              'Log in at: ' + portalLink + '\n\n' +
              'Questions? Email media@thenationalleague.org.uk\n\nThe National League',
    htmlBody: buildApprovalEmail(firstName, portalLink),
    name:     config.senderName,
    from:     config.senderAlias
  });

  Logger.log('Approval email sent to ' + email);
  return { ok: true };
}

/* ---- Send rejection email ------------------------------------------------ */
function sendRejection(body) {
  /* AuthZ: an admin decision — verified league admin/superadmin only. */
  var caller = verifyCaller_(body.idToken);
  if (!caller.ok) return { ok: false, error: caller.error };
  if (caller.user.role !== 'admin' && caller.user.role !== 'superadmin') {
    return { ok: false, error: 'Admins only.' };
  }

  var name  = String(body.name  || '').trim();
  var email = String(body.email || '').trim().toLowerCase();

  if (!email) return { ok: false, error: 'Email required.' };

  var config    = getConfig();
  var firstName = name ? name.split(' ')[0] : 'there';

  MailApp.sendEmail({
    to:       email,
    subject:  'Your NL Tools access request',
    body:     'Hi ' + firstName + ',\n\nUnfortunately your request for access to NL Tools has not been approved.\n\n' +
              'Questions? Email media@thenationalleague.org.uk\n\nThe National League',
    htmlBody: buildRejectionEmail(firstName),
    name:     config.senderName,
    from:     config.senderAlias
  });

  Logger.log('Rejection email sent to ' + email);
  return { ok: true };
}

/* ---- Helper: fetch admin/superadmin emails from RTDB -------------------- */
function getAdminEmails(config) {
  var result = rtdbRead(config.rtdbUrl + '/users.json', config.rtdbSecret);
  if (!result.ok || !result.data) return [];
  var emails = [];
  Object.keys(result.data).forEach(function(uid) {
    var u = result.data[uid];
    if ((u.role === 'admin' || u.role === 'superadmin') && u.email) {
      emails.push(u.email);
    }
  });
  return emails;
}
