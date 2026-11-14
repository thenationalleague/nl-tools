/* =========================================================================
   notifications.gs — Email notifications for request flow
   AuthZ: sendApproval / sendRejection require a verified league admin (they
   are admin decisions). notifyAdmin / confirmRequest need the requester's
   own sign-in and send only to addresses and with details from the server's
   records (14/11/2026). verifyCaller_
   lives in utils.gs.
   ========================================================================= */

/* ---- The request flow: who is asking, from the server's records --------
   Since 14/11/2026 both emails below need the requester's own sign-in
   (idToken), and take nothing else from the request. Before, anyone could
   call them with any name, any address and any link, and have the League's
   address send it: confirmRequest to any inbox, notifyAdmin to every admin
   with a "Review" button pointing wherever the caller liked. Now the address
   is the verified one, the name, club and title come from the person's
   record and their admin/requests entry (written by submitAccessRequest),
   the link is fixed, and each is sent once per person per six hours. */
function requester_(body) {
  var who = verifyIdentity_(body && body.idToken);
  if (!who.ok) return { ok: false, error: who.error };
  var config = getConfig();
  if (!config.rtdbUrl)     return { ok: false, error: 'RTDB_URL not set.' };
  if (!config.senderAlias) return { ok: false, error: 'SENDER_ALIAS not set.' };
  var u = rtdbRead(config.rtdbUrl + '/users/' + who.uid + '.json', config.rtdbSecret);
  if (!u.ok || !u.data || u.data.pending !== true) return { ok: false, error: 'No request is waiting.' };
  var reqs = rtdbRead(config.rtdbUrl + '/admin/requests.json', config.rtdbSecret);
  var req = {};
  Object.keys((reqs.ok && reqs.data) || {}).forEach(function (k) {
    var r = reqs.data[k];
    if (r && r.uid === who.uid && r.status === 'pending') req = r;
  });
  return { ok: true, config: config, uid: who.uid, email: String(who.email || '').toLowerCase(),
    name: String(u.data.name || ''), club: String(req.club || ''), jobTitle: String(req.jobTitle || ''),
    tools: req.tools || {} };
}

function onceFor_(what, uid) {
  var cache = CacheService.getScriptCache();
  var key = what + '_' + uid;
  if (cache.get(key)) return false;
  cache.put(key, '1', 6 * 60 * 60);
  return true;
}

/* ---- Notify all admins of new request ------------------------------------ */
function notifyAdmin(body) {
  var r = requester_(body);
  if (!r.ok) return r;
  if (!onceFor_('notified', r.uid)) return { ok: true, notified: 0 };
  var config = r.config;

  /* Fetch all admin/superadmin users from RTDB dynamically */
  var adminEmails = getAdminEmails(config);
  if (adminEmails.length === 0) {
    adminEmails.push(config.senderAlias);
    Logger.log('No admin users found -- falling back to SENDER_ALIAS');
  }

  var toolList = Object.keys(r.tools).filter(function(k) { return r.tools[k] === 'access' || r.tools[k] === 'admin'; });
  var link     = 'https://nl.tools/access/?tab=requests';
  var subject  = '[NL Tools] New access request — ' + r.name + (r.club ? ' (' + r.club + ')' : '');
  var htmlBody = buildAdminNotifyEmail(r.name, r.email, r.club, r.jobTitle, toolList, link);
  var textBody =
    'A new access request has been submitted.\n\n' +
    'Name:      ' + r.name     + '\n' +
    'Email:     ' + r.email    + '\n' +
    (r.club     ? 'Club:      ' + r.club     + '\n' : '') +
    (r.jobTitle ? 'Role:      ' + r.jobTitle + '\n' : '') +
    (toolList.length ? 'Tools:     ' + toolList.join(', ') + '\n' : '') +
    'Time:      ' + new Date().toLocaleString('en-GB') + '\n\n' +
    'Review it in Access:\n' + link;

  adminEmails.forEach(function(adminEmail) {
    try {
      MailApp.sendEmail({ to: adminEmail, subject: subject, body: textBody, htmlBody: htmlBody, name: config.senderName, from: config.senderAlias });
    } catch(err) {
      Logger.log('Failed to notify an admin: ' + err.message);
    }
  });
  return { ok: true, notified: adminEmails.length };
}

/* ---- Confirm request receipt to user ------------------------------------- */
function confirmRequest(body) {
  var r = requester_(body);
  if (!r.ok) return r;
  if (!onceFor_('confirmed', r.uid)) return { ok: true, sent: 0 };
  var config    = r.config;
  var firstName = r.name ? r.name.split(' ')[0] : 'there';
  MailApp.sendEmail({
    to:       r.email,
    subject:  'Your NL Tools request has been received',
    body:     'Hi ' + firstName + ',\n\nThanks for requesting access to NL Tools.\n\n' +
              'Your request is being reviewed and you\'ll hear back shortly.\n\n' +
              'Questions? Email media@thenationalleague.org.uk\n\nThe National League',
    htmlBody: buildConfirmEmail(firstName),
    name:     config.senderName,
    from:     config.senderAlias
  });
  return { ok: true, sent: 1 };
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
  var portalLink = config.continueUrl || 'https://nl.tools/';

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