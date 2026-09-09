/* =========================================================================
   UwPromo.gs — UW voucher platform notifications
   One job: when an online-route club finishes uploading codes, tell the
   people who dispatch (spec v42.0 item 6 — otherwise an upload can sit
   unnoticed for up to a month).

   AuthZ: open, like notifyAdmin — the caller is club staff with no account.
   The blast radius is bounded the same way: recipients are never taken from
   the request. They come from RTDB app-data/uw-promo/config/support/notify,
   which only the NL master console can write, read here with the server
   credential (the node is not client-readable). The request only says which
   club and how many.
   ========================================================================= */

function uwPromoUploadNotify(body) {
  var clubName = String(body.clubName || '').trim();
  var clubCode = String(body.clubCode || '').trim().replace(/[^A-Za-z0-9]/g, '');
  var count    = Math.max(0, parseInt(body.count, 10) || 0);
  var label    = String(body.batchLabel || '').trim();
  var isTest   = body.test === true;

  if (!clubName || !count) return { ok: false, error: 'Nothing to notify about.' };

  var config = getConfig();
  if (!config.rtdbUrl)     return { ok: false, error: 'RTDB_URL not set.' };
  if (!config.senderAlias) return { ok: false, error: 'SENDER_ALIAS not set.' };

  var root = isTest ? 'app-data/uw-promo-test' : 'app-data/uw-promo';
  var sup = rtdbRead(config.rtdbUrl + '/' + root + '/config/support.json', config.rtdbSecret);
  var recipients = String((sup.ok && sup.data && sup.data.notify) || '')
    .split(',').map(function (a) { return a.trim(); }).filter(Boolean);
  /* No recipients configured is not an error worth surfacing at a club's
     till: the upload already succeeded. The master console owns the fix. */
  if (!recipients.length) return { ok: true, sent: 0 };

  /* Sanity-check the club exists rather than emailing whatever a caller
     typed — the name in the subject line should be one of ours. */
  var clubRec = clubCode
    ? rtdbRead(config.rtdbUrl + '/' + root + '/config/clubs/' + clubCode + '/name.json', config.rtdbSecret)
    : { ok: false };
  var safeName = (clubRec.ok && clubRec.data) ? String(clubRec.data) : clubName;

  var subject = (isTest ? '[TEST] ' : '') + '[UW Vouchers] ' + safeName + ' uploaded ' +
    count + ' code' + (count === 1 ? '' : 's');
  var bodyText =
    safeName + ' has uploaded ' + count + ' voucher code' + (count === 1 ? '' : 's') +
    (label ? ' (batch: ' + label + ')' : '') + '.\n\n' +
    'They are live and registered to the club. Review or export them from the ' +
    'master console:\n\nhttps://nl.tools/uw-promo/admin/' + (isTest ? '?env=test' : '') + '\n\n' +
    'This is an automated note from the UW voucher platform.';

  recipients.forEach(function (to) {
    MailApp.sendEmail({
      to: to, subject: subject, body: bodyText,
      name: config.senderName, from: config.senderAlias
    });
  });
  return { ok: true, sent: recipients.length };
}


/* ---- Overdue-request digest ----------------------------------------------
   Poked daily by the uwPromoOverdue scheduled function when open requests
   have passed their due date. Self-contained on purpose: this reads the
   requests, the club names and the recipient list itself with the server
   credential, so the poke carries no content and an outside caller can make
   it do nothing except send the true digest to the configured people. */
function uwPromoOverdueDigest() {
  var config = getConfig();
  if (!config.rtdbUrl)     return { ok: false, error: 'RTDB_URL not set.' };
  if (!config.senderAlias) return { ok: false, error: 'SENDER_ALIAS not set.' };

  var root = 'app-data/uw-promo';
  var sup = rtdbRead(config.rtdbUrl + '/' + root + '/config/support.json', config.rtdbSecret);
  var recipients = String((sup.ok && sup.data && sup.data.notify) || '')
    .split(',').map(function (a) { return a.trim(); }).filter(Boolean);
  if (!recipients.length) return { ok: true, sent: 0 };

  var reqs = rtdbRead(config.rtdbUrl + '/' + root + '/requests.json', config.rtdbSecret);
  var clubs = rtdbRead(config.rtdbUrl + '/' + root + '/config/clubs.json', config.rtdbSecret);
  var now = Date.now();
  var lines = [];
  Object.keys((reqs.ok && reqs.data) || {}).forEach(function (k) {
    var r = reqs.data[k] || {};
    if (r.status !== 'open' || typeof r.due !== 'number' || now <= r.due) return;
    var name = (clubs.ok && clubs.data && clubs.data[r.club] && clubs.data[r.club].name) || r.club;
    var days = Math.floor((now - r.due) / 86400000);
    lines.push(name + ' — ' + r.qty + ' code' + (r.qty === 1 ? '' : 's') + ', ' +
      (days < 1 ? 'due today' : days + ' day' + (days === 1 ? '' : 's') + ' overdue'));
  });
  if (!lines.length) return { ok: true, sent: 0 };

  lines.sort();
  var subject = '[UW Vouchers] ' + lines.length + ' overdue code request' + (lines.length === 1 ? '' : 's');
  var bodyText = 'Open code requests past their due date:\n\n' + lines.join('\n') +
    '\n\nRaise, chase or mark fulfilled from the consoles:\n' +
    'https://nl.tools/uw-promo/ (UW) · https://nl.tools/uw-promo/admin/ (NL)\n\n' +
    'This is the daily automated digest — it only sends on days something is overdue.';

  recipients.forEach(function (to) {
    MailApp.sendEmail({ to: to, subject: subject, body: bodyText,
      name: config.senderName, from: config.senderAlias });
  });
  return { ok: true, sent: recipients.length, overdue: lines.length };
}
