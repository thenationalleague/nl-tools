/* =========================================================================
   JobHealth.gs — the weekly note on background jobs
   Version: v1.0 (14/11/2026)

   One job: when Timer · Background job check (job-health.yml) has written a
   note and marked it due, email it to the media inbox and clear it.

   AuthZ: open, like uwPromo_overdueDigest. Nothing comes from the request:
   the note is read from app-data/ops-estate/job-health/note with the server
   credential, and only that workflow (a Google service account) can write
   it. The recipient is fixed here. Asking twice sends once, because the
   first send clears `due`.
   ========================================================================= */

var JOB_HEALTH_TO = 'media@thenationalleague.org.uk';

function jobHealthSend() {
  var config = getConfig();
  if (!config.rtdbUrl)     return { ok: false, error: 'RTDB_URL not set.' };
  if (!config.senderAlias) return { ok: false, error: 'SENDER_ALIAS not set.' };

  var base = config.rtdbUrl + '/app-data/ops-estate/job-health/note';
  var note = rtdbRead(base + '.json', config.rtdbSecret);
  if (!note.ok) return { ok: false, error: note.error };
  var n = note.data || {};
  if (n.due !== true || !n.subject || !n.text) return { ok: true, sent: 0 };

  MailApp.sendEmail({
    to: JOB_HEALTH_TO, subject: String(n.subject), body: String(n.text),
    name: config.senderName, from: config.senderAlias
  });
  rtdbWrite(base + '/due.json', false, config.rtdbSecret);
  rtdbWrite(base + '/sentAt.json', Date.now(), config.rtdbSecret);
  return { ok: true, sent: 1 };
}
