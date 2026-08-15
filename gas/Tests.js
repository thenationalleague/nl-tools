/* =========================================================================
   tests.gs — Manual test functions. Run from GAS editor, never via web request.
   ========================================================================= */

function testSetup() {
  var config = getConfig();

  Logger.log('=== NL Tools GAS Setup Test ===');
  Logger.log('FIREBASE_CONTINUE_URL : ' + (config.continueUrl ? 'YES (' + config.continueUrl + ')' : 'NO \u2717'));
  Logger.log('SENDER_ALIAS          : ' + (config.senderAlias ? 'YES (' + config.senderAlias + ')' : 'NO \u2717'));
  Logger.log('RTDB_URL              : ' + (config.rtdbUrl     ? 'YES'                              : 'NO \u2717'));
  Logger.log('RTDB_SECRET           : ' + (config.rtdbSecret  ? 'YES (hidden)'                     : 'NO \u2717'));
  Logger.log('DRIVE_ID              : ' + (config.driveId     ? 'YES (' + config.driveId + ')'     : 'NO \u2717'));
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

  /* Test Drive access */
  if (config.driveId) {
    try {
      var result = Drive.Files.list({
        q:                         '"' + config.driveId + '" in parents and trashed = false',
        corpora:                   'allDrives',
        includeItemsFromAllDrives: true,
        supportsAllDrives:         true,
        pageSize:                  5,
        fields:                    'files(id, name, mimeType)'
      });
      var files = result.files || [];
      Logger.log('Drive root items      : ' + files.length + ' found');
      files.forEach(function(f) {
        Logger.log('  ' + (f.mimeType === 'application/vnd.google-apps.folder' ? '[folder]' : '[file]  ') + ' ' + f.name);
      });
    } catch(err) {
      Logger.log('Drive read            : FAILED \u2717 \u2014 ' + err.message);
    }
  }
}