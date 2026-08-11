/* =========================================================================
   PhotoShelterOnboarding.gs — email for the PhotoShelter onboarding sign-up

   In-repo mirror of the Apps Script handler (keep in lockstep with the live
   project). Paste this file into the Apps Script project, add the router
   lines to doPost (see Code.gs), then UPDATE the existing deployment — do
   not create a new one, or NL.endpoints.gas stops pointing at this code.

   Actions
     ps_confirm      Receipt to the person who just registered. Called by the
                     public page AFTER the booking is already in RTDB, and
                     its result is ignored, so this failing costs a receipt
                     and never a registration. Open by design: the page has
                     no account to authenticate with. It emails only the
                     address in the payload and says nothing sensitive, so
                     the worst an abuser gets is a polite note sent to an
                     address they already knew.

     ps_requestCode  Optional 4-digit verification code, mirroring the
                     Vacancies flow. Only used if the page sets
                     CFG.verifyEmail = true.
     ps_submit       Verifies that code and writes the booking to RTDB with
                     the database secret. Only used with CFG.verifyEmail.

   The page works with none of this pasted (bookings write straight to RTDB
   behind anonymous auth). Pasting ps_confirm adds the receipt; pasting all
   three lets you move the write server-side.
   ========================================================================= */

var PS_RTDB_PATH  = 'app-data/ops-photoshelter-onboarding/bookings';
var PS_CONTACT    = 'richard@thenationalleague.org.uk';
var PS_CODE_MINS  = 10;

/* ---- Receipt ------------------------------------------------------------ */
function ps_confirm(body) {
  var email = String(body.email || '').trim();
  var name  = String(body.name  || '').trim();
  var club  = String(body.club  || '').trim();
  var dates = body.dates || [];

  if (!ps_validEmail_(email)) return { ok: false, error: 'Valid email required.' };

  var config = getConfig();
  if (!config.senderAlias) return { ok: false, error: 'SENDER_ALIAS not set.' };

  var firstName = name.split(' ')[0] || 'there';
  var dateList  = (dates.length ? dates : ['(none selected)']);

  var subject = 'PhotoShelter onboarding — thanks for registering';

  var textBody =
    'Hi ' + firstName + ',\n\n' +
    'Thanks for registering for PhotoShelter onboarding.\n\n' +
    'You told us you can make:\n' +
    dateList.map(function (d) { return '  • ' + d; }).join('\n') + '\n\n' +
    'All four sessions cover the same ground, so you only need to attend one. ' +
    'We will be in touch over the coming days to confirm which slot you have ' +
    'been assigned, along with the joining link.\n\n' +
    'Need to change anything, or registered by mistake? Just reply to this ' +
    'email or write to ' + PS_CONTACT + ' and we will sort it out.\n\n' +
    'The National League';

  var htmlBody =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1b2b45;">' +
      '<p>Hi ' + ps_esc_(firstName) + ',</p>' +
      '<p>Thanks for registering for PhotoShelter onboarding' +
        (club ? ' on behalf of ' + ps_esc_(club) : '') + '.</p>' +
      '<p><strong>You told us you can make:</strong></p>' +
      '<ul style="margin:0 0 16px;padding-left:20px;">' +
        dateList.map(function (d) { return '<li>' + ps_esc_(String(d)) + '</li>'; }).join('') +
      '</ul>' +
      '<p>All four sessions cover the same ground, so you only need to attend ' +
        'one. We will be in touch over the coming days to confirm which slot ' +
        'you have been assigned, along with the joining link.</p>' +
      '<p style="color:#5a6a82;font-size:13px;">Need to change anything, or ' +
        'registered by mistake? Reply to this email or write to ' +
        '<a href="mailto:' + PS_CONTACT + '">' + PS_CONTACT + '</a> ' +
        'and we will sort it out.</p>' +
      '<p style="color:#5a6a82;font-size:13px;">The National League</p>' +
    '</div>';

  MailApp.sendEmail({
    to:       email,
    subject:  subject,
    body:     textBody,
    htmlBody: htmlBody,
    name:     'The National League',
    replyTo:  PS_CONTACT
  });

  return { ok: true };
}

/* ---- Optional: 4-digit verification ------------------------------------- */
function ps_requestCode(body) {
  var email = String(body.email || '').trim();
  if (!ps_validEmail_(email)) return { ok: false, error: 'Valid email required.' };

  var config = getConfig();
  if (!config.senderAlias) return { ok: false, error: 'SENDER_ALIAS not set.' };

  var code = String(Math.floor(1000 + Math.random() * 9000));
  CacheService.getScriptCache()
    .put('ps_code_' + email.toLowerCase(), code, PS_CODE_MINS * 60);

  MailApp.sendEmail({
    to:      email,
    subject: 'Your PhotoShelter onboarding code: ' + code,
    body:    'Your code is ' + code + '.\n\nIt expires in ' + PS_CODE_MINS +
             ' minutes. If you did not request it, ignore this email.\n\n' +
             'The National League',
    name:    'The National League',
    replyTo: PS_CONTACT
  });

  return { ok: true };
}

function ps_submit(body) {
  var b     = body.booking || {};
  var code  = String(body.code || '').trim();
  var email = String(b.email  || '').trim();

  if (!ps_validEmail_(email))          return { ok: false, error: 'Valid email required.' };
  if (!String(b.club || '').trim())    return { ok: false, error: 'Club required.' };
  if (!String(b.name || '').trim())    return { ok: false, error: 'Name required.' };
  if (!b.dates || !Object.keys(b.dates).length)
                                       return { ok: false, error: 'Pick at least one date.' };

  var key    = 'ps_code_' + email.toLowerCase();
  var cached = CacheService.getScriptCache().get(key);
  if (!cached)         return { ok: false, error: 'That code has expired. Request a new one.' };
  if (cached !== code) return { ok: false, error: 'That code is not right.' };

  var config = getConfig();
  if (!config.rtdbUrl) return { ok: false, error: 'RTDB_URL not set.' };

  /* Must be a POST, not the shared rtdbWrite: that helper is PUT-only, and a
     PUT to bookings.json would replace the whole collection with this one
     record. POST is what mints a push key and appends. */
  var res = ps_rtdbPush_(config.rtdbUrl + '/' + PS_RTDB_PATH + '.json', b, config.rtdbSecret);
  if (!res.ok) return { ok: false, error: res.error };

  /* Code is single-use: burn it so a replay cannot post a second booking. */
  CacheService.getScriptCache().remove(key);

  /* Same receipt as the direct-write path, so the two behave identically. */
  var dates = Object.keys(b.dates);
  try { ps_confirm({ email: email, name: b.name, club: b.club, dates: dates }); }
  catch (err) { /* receipt is not worth failing a saved booking over */ }

  return { ok: true };
}

/* ---- Helpers ------------------------------------------------------------ */

/* Append a child under a collection, letting RTDB mint the push key. The
   shared rtdbWrite() in Utils.gs hardcodes PUT, which replaces whatever is
   at the path — fine for the single-record writes it was built for, wrong
   for a list. */
function ps_rtdbPush_(url, data, secret) {
  var authUrl = secret ? url + '?auth=' + secret : url;
  try {
    var response = UrlFetchApp.fetch(authUrl, {
      method:             'post',
      contentType:        'application/json',
      payload:            JSON.stringify(data),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      return { ok: false, error: 'RTDB push failed: HTTP ' + code + ' — ' + response.getContentText() };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function ps_validEmail_(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));
}

function ps_esc_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
