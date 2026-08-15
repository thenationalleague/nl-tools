/* =========================================================================
   tests.gs — Manual test functions. Run from GAS editor, never via web request.
   ========================================================================= */

function testSetup() {
  var config = getConfig();

  Logger.log('=== NL Tools GAS Setup Test ===');
  Logger.log('FIREBASE_CONTINUE_URL : ' + (config.continueUrl ? 'YES (' + config.continueUrl + ')' : 'NO \u2717'));
  Logger.log('SENDER_ALIAS          : ' + (config.senderAlias ? 'YES (' + config.senderAlias + ')' : 'NO \u2717'));

  /* Set is not the same as usable. MailApp.sendEmail's `from` only accepts an
     address this account actually holds as a send-as alias; anything else
     throws "Invalid argument: from" at send time — a message naming neither the
     alias nor the account. Every email in the project depends on this one
     Workspace setting, and nothing else in the repo would notice it changing. */
  if (config.senderAlias) {
    try {
      var aliases = GmailApp.getAliases();
      var usable  = aliases.indexOf(config.senderAlias) !== -1;
      Logger.log('  \u2514 usable as `from`  : ' + (usable ? 'YES \u2713' : 'NO \u2717 \u2014 NOT an alias of this account'));
      if (!usable) {
        Logger.log('     account holds     : ' + (aliases.join(', ') || 'no aliases at all'));
        Logger.log('     fix               : Gmail \u2192 Settings \u2192 Accounts \u2192 "Send mail as",');
        Logger.log('                         on the account that OWNS this script.');
        Logger.log('     until fixed       : every invite, approval, access request and');
        Logger.log('                         vacancy email fails with "Invalid argument: from".');
      }
    } catch (err) {
      Logger.log('  \u2514 usable as `from`  : could not check \u2014 ' + err.message);
    }
  }
  Logger.log('RTDB_URL              : ' + (config.rtdbUrl     ? 'YES'                              : 'NO \u2717'));
  Logger.log('RTDB_SECRET           : ' + (config.rtdbSecret  ? 'YES (hidden)'                     : 'NO \u2717'));
  Logger.log('MailApp quota         : ' + MailApp.getRemainingDailyQuota());

  /* Test RTDB write */
  if (config.rtdbUrl) {
    var writeTest = rtdbWrite(config.rtdbUrl + '/admin/invites/_test.json', { test: true, ts: new Date().toISOString() }, config.rtdbSecret);
    Logger.log('RTDB write            : ' + (writeTest.ok ? 'OK \u2713' : 'FAILED \u2717 \u2014 ' + writeTest.error));
    if (writeTest.ok) rtdbWrite(config.rtdbUrl + '/admin/invites/_test.json', null, config.rtdbSecret);

    /* Show who would receive admin notifications */
    var adminEmails = getAdminEmails(config);
    Logger.log('Admin notification recipients (' + adminEmails.length + '): ' + (adminEmails.join(', ') || 'none found \u2014 will fall back to SENDER_ALIAS'));
  }

  /* The Drive test that used to live here went with Programme Packs on
     15/08/2026. Nothing in this project touches Google Drive any more, so
     DRIVE_ID is vestigial and testing it would only ask a question whose
     answer no longer matters. */
}