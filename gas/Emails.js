/* =========================================================================
   emails.gs — HTML email templates
   All functions return HTML strings. Text fallbacks are inline in notifications.gs.
   ========================================================================= */

/* ---- Shared partials ----------------------------------------------------- */
function emailHeader() {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#9e0000;border-bottom:5px solid #223b7c;">' +
    '<tr><td style="padding:24px 32px;">' +
    '<img src="https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/National%20League%20rose%20white.png"' +
    ' alt="The National League" height="48" style="display:block;"></td></tr></table>' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px;">' +
    '<table width="600" cellpadding="0" cellspacing="0" align="center"' +
    ' style="background:#ffffff;border-radius:8px;box-shadow:0 2px 12px rgba(10,22,40,0.10);max-width:100%;">' +
    '<tr><td style="padding:40px 40px 32px;">';
}

function emailFooter() {
  return '</td></tr></table></td></tr></table>' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;text-align:center;">' +
    '<p style="margin:0;font-size:11px;color:#5a6a82;">' +
    '&copy; The National League &nbsp;|&nbsp; thenationalleague.org.uk</p>' +
    '</td></tr></table></body></html>';
}

function emailBtn(link, label) {
  return '<table cellpadding="0" cellspacing="0" style="margin:0 0 32px;">' +
    '<tr><td style="background:#9e0000;border-radius:6px;">' +
    '<a href="' + link + '" style="display:inline-block;padding:14px 32px;color:#ffffff;' +
    'font-size:15px;font-weight:700;text-decoration:none;letter-spacing:0.04em;">' + label + '</a>' +
    '</td></tr></table>';
}

function emailContact() {
  return '<hr style="border:none;border-top:1px solid #dde3ed;margin:24px 0;">' +
    '<p style="margin:0;font-size:12px;color:#5a6a82;line-height:1.6;">' +
    'Questions? Email <a href="mailto:media@thenationalleague.org.uk" style="color:#9e0000;">' +
    'media@thenationalleague.org.uk</a></p>';
}

function emailTableRow(label, value) {
  return '<tr>' +
    '<td style="padding:6px 12px 6px 0;font-size:12px;font-weight:700;color:#5a6a82;' +
    'text-transform:uppercase;letter-spacing:0.06em;white-space:nowrap;vertical-align:top;">' + label + '</td>' +
    '<td style="padding:6px 0;font-size:14px;color:#1a2a44;">' + value + '</td>' +
    '</tr>';
}

function greeting(firstName) {
  return '<p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a2a44;">Hi ' + escHtml(firstName) + ',</p>';
}

/* ---- Invite -------------------------------------------------------------- */
function buildInviteEmail(name, orgLine, link) {
  var firstName = name ? name.split(' ')[0] : 'there';
  return emailHeader() +
    greeting(firstName) +
    '<p style="margin:0 0 24px;font-size:16px;color:#5a6a82;line-height:1.6;">' +
    'You\'ve been invited to access <strong>NL Tools</strong>, the internal portal for The National League.</p>' +
    (orgLine ?
      '<p style="margin:0 0 24px;"><span style="display:inline-block;background:#eef2ff;color:#223b7c;' +
      'border-radius:12px;padding:5px 14px;font-size:13px;font-weight:700;">' + escHtml(orgLine) + '</span></p>'
      : '') +
    '<p style="margin:0 0 32px;font-size:15px;color:#1a2a44;line-height:1.6;">' +
    'Click the button below to set up your account. The link is valid for 24\u00a0hours.</p>' +
    emailBtn(link, 'Accept invitation') +
    '<p style="margin:0 0 24px;font-size:13px;color:#5a6a82;line-height:1.6;">' +
    'If the button doesn\'t work, copy and paste this link into your browser:<br>' +
    '<a href="' + link + '" style="color:#9e0000;word-break:break-all;">' + link + '</a></p>' +
    emailContact() +
    emailFooter();
}

function buildInviteEmailText(name, orgLine, link) {
  var firstName = name ? name.split(' ')[0] : 'there';
  return 'Hi ' + firstName + ',\n\n' +
    'You\'ve been invited to access NL Tools, the internal portal for The National League.\n\n' +
    (orgLine ? 'Access: ' + orgLine + '\n\n' : '') +
    'Accept your invitation (valid 24 hours):\n' + link + '\n\n' +
    'The National League\nthenationalleague.org.uk';
}

/* ---- Admin notification -------------------------------------------------- */
function buildAdminNotifyEmail(name, email, club, clubRole, toolList, portalUrl) {
  return emailHeader() +
    '<p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a2a44;">New access request</p>' +
    '<p style="margin:0 0 24px;font-size:14px;color:#5a6a82;">Someone has requested access to NL Tools.</p>' +
    '<table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">' +
    emailTableRow('Name',  escHtml(name)) +
    emailTableRow('Email', escHtml(email)) +
    (club     ? emailTableRow('Club',      escHtml(club))     : '') +
    (clubRole ? emailTableRow('Job title', escHtml(clubRole)) : '') +
    (toolList && toolList.length ? emailTableRow('Tools requested', escHtml(toolList.join(', '))) : '') +
    '</table>' +
    emailBtn(portalUrl, 'Review in admin panel') +
    emailFooter();
}

/* ---- Request confirmation to user ---------------------------------------- */
function buildConfirmEmail(firstName) {
  return emailHeader() +
    greeting(firstName) +
    '<p style="margin:0 0 24px;font-size:16px;color:#5a6a82;line-height:1.6;">' +
    'Thanks for requesting access to <strong>NL Tools</strong>.</p>' +
    '<p style="margin:0 0 24px;font-size:15px;color:#1a2a44;line-height:1.6;">' +
    'Your request is being reviewed by The National League. We\'ll be in touch shortly.</p>' +
    '<p style="margin:0 0 32px;font-size:15px;color:#1a2a44;line-height:1.6;">' +
    'In the meantime you can log in at any time to check your request status.</p>' +
    emailContact() +
    emailFooter();
}

/* ---- Approval ------------------------------------------------------------ */
function buildApprovalEmail(firstName, portalLink) {
  return emailHeader() +
    greeting(firstName) +
    '<p style="margin:0 0 24px;font-size:16px;color:#5a6a82;line-height:1.6;">' +
    'Great news \u2014 your request to access <strong>NL Tools</strong> has been approved.</p>' +
    '<p style="margin:0 0 32px;font-size:15px;color:#1a2a44;line-height:1.6;">' +
    'Log in using the email address and password you set when you applied.</p>' +
    emailBtn(portalLink, 'Go to NL Tools') +
    emailContact() +
    emailFooter();
}

/* ---- Rejection ----------------------------------------------------------- */
function buildRejectionEmail(firstName) {
  return emailHeader() +
    greeting(firstName) +
    '<p style="margin:0 0 24px;font-size:16px;color:#5a6a82;line-height:1.6;">' +
    'Thank you for your interest in NL Tools.</p>' +
    '<p style="margin:0 0 32px;font-size:15px;color:#1a2a44;line-height:1.6;">' +
    'Unfortunately your request for access has not been approved at this time.</p>' +
    emailContact() +
    emailFooter();
}