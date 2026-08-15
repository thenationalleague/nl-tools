/* =========================================================================
   Vacancies.gs — Vacancy submission email verification & notifications
   Version: 1.3 (conversation turn 7)
   Date: 17/04/2026

   CHANGELOG
   v1.3 (17/04/2026)
     - RTDB restructure: all paths under /app-data/

   v1.2 (17/04/2026)
     - RTDB restructure: submission write path changed from
       /submissions/{id} to /app-data/ops-vacancies/submissions/{id}

   v1.1 (08/04/2026)
     - Initial consolidated version

   Handles:
   - 4-digit email verification for external (unauthenticated) submitters
   - Writing verified submissions to Firebase RTDB at /app-data/ops-vacancies/submissions/{id}
   - Notification emails to NL team on new submission
   - validateCode endpoint so frontend can verify before Firebase write

   Script Properties required (shared with rest of portal GAS):
   - SENDER_ALIAS   e.g. media@thenationalleague.org.uk
   - RTDB_URL       e.g. https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app
   - RTDB_SECRET    Firebase RTDB legacy secret

   Actions handled (called from main doPost router):
   - vacancies_requestCode     → generate + email 4-digit code
   - vacancies_validateCode    → verify code is valid (public, no auth)
   - vacancies_submit          → validate code + write submission to RTDB
   - vacancies_submitAuthed    → portal user submission, skips code (already authed)
   - vacancies_notify          → send notification email to NL team
   ========================================================================= */

var VAC_CODE_TTL_MS   = 10 * 60 * 1000; // 10 minutes
var VAC_NOTIFY_EMAILS = [
  'media@thenationalleague.org.uk',
  'richard@thenationalleague.org.uk',
];

/* ── Request code ───────────────────────────────────────────────────────── */
function vacRequestCode(body) {
  var email = String(body.email || '').trim().toLowerCase();
  if (!email || !isValidEmail(email)) {
    return respond({ success: false, message: 'Invalid email address.' });
  }

  var code   = String(Math.floor(1000 + Math.random() * 9000)); // 4 digits
  var expiry = Date.now() + VAC_CODE_TTL_MS;
  var key    = 'vac_code_' + email.replace(/[^a-z0-9]/g, '_');

  PropertiesService.getScriptProperties().setProperty(key, JSON.stringify({
    code: code, expiry: expiry, email: email
  }));

  var props       = PropertiesService.getScriptProperties().getProperties();
  var senderAlias = props['SENDER_ALIAS'] || '';

  try {
    var htmlBody =
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1a2a44;">' +
      '<img src="https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/National%20League%20rose.png" ' +
      'style="height:48px;margin-bottom:20px;display:block;" alt="National League">' +
      '<h2 style="margin:0 0 12px;font-size:20px;">Vacancy submission — verification code</h2>' +
      '<p>Your verification code is:</p>' +
      '<p style="font-size:36px;font-weight:bold;letter-spacing:8px;margin:16px 0;color:#9e0000;">' + code + '</p>' +
      '<p>This code expires in 10 minutes.</p>' +
      '<p style="color:#5a6a82;font-size:13px;">If you did not request this, please ignore this email.</p>' +
      '<p style="color:#5a6a82;font-size:13px;margin-top:24px;">National League</p>' +
      '</div>';

    var opts = {
      htmlBody: htmlBody,
      name:     'The National League',
    };
    if (senderAlias) opts.from = senderAlias;

    MailApp.sendEmail(
      email,
      'National League Vacancies — your verification code',
      'Your verification code is: ' + code + '. This code expires in 10 minutes.',
      opts
    );
  } catch(err) {
    return respond({ success: false, message: 'Could not send email. Please check the address and try again.' });
  }

  return respond({ success: true });
}

/* ── Validate code (public — called before Firebase write) ──────────────── */
function vacValidateCode(body) {
  var email = String(body.email || '').trim().toLowerCase();
  var code  = String(body.code  || '').trim();
  if (!email || !code) return respond({ success: false, message: 'Missing email or code.' });

  var result = vacCheckCode(email, code, false); // false = don't consume yet
  return respond(result);
}

/* ── Submit (external, unauthenticated — requires valid code) ───────────── */
function vacSubmit(body) {
  var email = String(body.submitterEmail || '').trim().toLowerCase();
  var code  = String(body.code || '').trim();

  if (!email) return respond({ success: false, message: 'Email is required.' });
  if (!code)  return respond({ success: false, message: 'Verification code is required.' });

  var check = vacCheckCode(email, code, true); // true = consume on success
  if (!check.success) return respond(check);

  if (!body['Club'])             return respond({ success: false, message: 'Club is required.' });
  if (!body['Job Title'])        return respond({ success: false, message: 'Job title is required.' });
  if (!body['Live Listing URL']) return respond({ success: false, message: 'Live listing URL is required.' });

  return vacWriteSubmission(body, email);
}

/* ── Submit authed (portal user — already authenticated, no code needed) ── */
function vacSubmitAuthed(body) {
  var email = String(body.submitterEmail || '').trim().toLowerCase();

  if (!email)                    return respond({ success: false, message: 'Email is required.' });
  if (!body['Club'])             return respond({ success: false, message: 'Club is required.' });
  if (!body['Job Title'])        return respond({ success: false, message: 'Job title is required.' });
  if (!body['Live Listing URL']) return respond({ success: false, message: 'Live listing URL is required.' });

  return vacWriteSubmission(body, email);
}

/* ── Write submission to Firebase RTDB ─────────────────────────────────── */
function vacWriteSubmission(body, email) {
  var props  = PropertiesService.getScriptProperties().getProperties();
  var rtdb   = props['RTDB_URL']    || '';
  var secret = props['RTDB_SECRET'] || '';

  if (!rtdb) return respond({ success: false, message: 'RTDB not configured.' });

  // Generate a push-style ID: timestamp + random suffix
  var id  = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  var url = rtdb + '/app-data/ops-vacancies/submissions/' + id + '.json';

  var submission = {
    club:           body['Club']             || '',
    jobTitle:       body['Job Title']        || '',
    location:       body['Location']         || '',
    vacancyType:    body['Vacancy Type']     || '',
    department:     body['Department']       || '',
    salary:         body['Salary']           || '',
    description:    body['Description']      || '',
    liveListingUrl: body['Live Listing URL'] || '',
    closingDate:    body['Closing Date']     || '',
    submitterName:  body.submitterName       || '',
    submitterEmail: email,
    submitterRole:  body.submitterRole       || '',
    submittedAt:    new Date().toISOString(),
    status:         'Pending',
    approvedBy:     '',
    notes:          '',
  };

  var result = rtdbWrite(url, submission, secret);
  if (!result.ok) return respond({ success: false, message: 'Could not save submission. Please try again.' });

  // Send notification email
  try { vacNotify(submission); } catch(e) { Logger.log('Notification error: ' + e.message); }

  return respond({ success: true });
}

/* ── Notification email ─────────────────────────────────────────────────── */
function vacNotify(sub) {
  var props       = PropertiesService.getScriptProperties().getProperties();
  var senderAlias = props['SENDER_ALIAS'] || '';
  var portalUrl   = 'https://nl.tools/vacancies/';

  var subject = 'New vacancy submission: ' + sub.jobTitle + ' — ' + sub.club;

  var textBody = [
    'A new vacancy has been submitted for review on the National League jobs board.',
    '',
    'VACANCY DETAILS',
    'Club:          ' + (sub.club           || '—'),
    'Job Title:     ' + (sub.jobTitle       || '—'),
    'Location:      ' + (sub.location       || '—'),
    'Type:          ' + (sub.vacancyType    || '—'),
    'Department:    ' + (sub.department     || '—'),
    'Salary:        ' + (sub.salary         || '—'),
    'Closing Date:  ' + (sub.closingDate    || '—'),
    'Live Listing:  ' + (sub.liveListingUrl || '—'),
    '',
    'SUBMITTED BY',
    'Name:          ' + (sub.submitterName  || '—'),
    'Email:         ' + (sub.submitterEmail || '—'),
    'Role at Club:  ' + (sub.submitterRole  || '—'),
    '',
    'Review: ' + portalUrl,
    'National League — Vacancies',
  ].join('\n');

  var htmlBody = emailHeader() +
    '<p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a2a44;">New vacancy submission</p>' +
    '<p style="margin:0 0 24px;font-size:14px;color:#5a6a82;">A new vacancy has been submitted for review.</p>' +
    '<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#5a6a82;text-transform:uppercase;letter-spacing:0.06em;">Vacancy</p>' +
    '<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">' +
    emailTableRow('Club',         escHtml(sub.club            || '—')) +
    emailTableRow('Job Title',    escHtml(sub.jobTitle        || '—')) +
    emailTableRow('Location',     escHtml(sub.location        || '—')) +
    emailTableRow('Type',         escHtml(sub.vacancyType     || '—')) +
    emailTableRow('Department',   escHtml(sub.department      || '—')) +
    emailTableRow('Salary',       escHtml(sub.salary          || '—')) +
    emailTableRow('Closing Date', escHtml(sub.closingDate     || '—')) +
    emailTableRow('Live Listing', '<a href="' + escHtml(sub.liveListingUrl || '') + '" style="color:#9e0000;">' + escHtml(sub.liveListingUrl || '—') + '</a>') +
    '</table>' +
    '<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#5a6a82;text-transform:uppercase;letter-spacing:0.06em;">Submitted by</p>' +
    '<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">' +
    emailTableRow('Name',  escHtml(sub.submitterName  || '—')) +
    emailTableRow('Email', escHtml(sub.submitterEmail || '—')) +
    emailTableRow('Role',  escHtml(sub.submitterRole  || '—')) +
    '</table>' +
    emailBtn(portalUrl, 'Review in Vacancies tool') +
    emailFooter();

  var opts = { name: 'The National League', htmlBody: htmlBody };
  if (senderAlias) opts.from = senderAlias;

  MailApp.sendEmail(VAC_NOTIFY_EMAILS.join(','), subject, textBody, opts);
}

/* ── Code helpers ───────────────────────────────────────────────────────── */
function vacCheckCode(email, code, consume) {
  var key = 'vac_code_' + email.replace(/[^a-z0-9]/g, '_');
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return { success: false, message: 'Invalid or expired code. Please request a new one.' };
  try {
    var stored = JSON.parse(raw);
    if (stored.code  !== String(code))  return { success: false, message: 'Incorrect code.' };
    if (Date.now()   >  stored.expiry)  return { success: false, message: 'Code expired. Please request a new one.' };
    if (consume) PropertiesService.getScriptProperties().deleteProperty(key);
    return { success: true };
  } catch(e) {
    return { success: false, message: 'Invalid or expired code. Please request a new one.' };
  }
}