/* =========================================================================
   utils.gs — Shared utilities used across all files

   In-repo mirror of the Apps Script file (keep in lockstep with the live
   project). Carries the shared Firebase token verifiers:
     verifyIdentity_(idToken) → { ok, uid, email }        (no RTDB profile needed)
     verifyCaller_(idToken)   → { ok, user:{uid,email,role,club} }  (reads profile)
   See system/rtdb/SECURITY-role-self-grant.md and gas/SECURITY-invite-authz.md.
   ========================================================================= */

/* ---- HTTP response ------------------------------------------------------- */
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---- RTDB REST ----------------------------------------------------------- */
function rtdbWrite(url, data, secret) {
  var authUrl = secret ? url + '?auth=' + secret : url;
  try {
    var response = UrlFetchApp.fetch(authUrl, {
      method:             'put',
      contentType:        'application/json',
      payload:            JSON.stringify(data),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code < 200 || code >= 300) {
      return { ok: false, error: 'RTDB write failed: HTTP ' + code + ' — ' + response.getContentText() };
    }
    return { ok: true };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

function rtdbRead(url, secret) {
  var authUrl = secret ? url + '?auth=' + secret : url;
  try {
    var response = UrlFetchApp.fetch(authUrl, { method: 'get', muteHttpExceptions: true });
    var code = response.getResponseCode();
    if (code !== 200) return { ok: false, error: 'RTDB read failed: HTTP ' + code };
    return { ok: true, data: JSON.parse(response.getContentText()) };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

/* ---- String helpers ------------------------------------------------------ */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function capitalise(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

/* ---- Firebase token verification ----------------------------------------- */
/* Verify a Firebase ID token and return { ok, uid, email } WITHOUT requiring an
   RTDB user profile. Used during invite acceptance, before the profile exists. */
function verifyIdentity_(idToken) {
  if (!idToken) return { ok: false, error: 'Sign-in required.' };
  var apiKey = PropertiesService.getScriptProperties().getProperty('FIREBASE_API_KEY');
  if (!apiKey) return { ok: false, error: 'FIREBASE_API_KEY not set.' };
  try {
    var resp = UrlFetchApp.fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + apiKey,
      { method: 'post', contentType: 'application/json',
        payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) return { ok: false, error: 'Invalid or expired sign-in.' };
    var data = JSON.parse(resp.getContentText());
    if (!data.users || !data.users[0]) return { ok: false, error: 'Token has no user.' };
    return { ok: true, uid: data.users[0].localId, email: data.users[0].email };
  } catch (e) {
    return { ok: false, error: 'Verification failed: ' + e.message };
  }
}

/* Verify a Firebase ID token AND resolve the caller's role from RTDB. Returns
   { ok:true, user:{uid,email,role,club} } or { ok:false, error }. Used to gate
   privileged actions (sendInvite / sendApproval / sendRejection). */
function verifyCaller_(idToken) {
  var ident = verifyIdentity_(idToken);
  if (!ident.ok) return { ok: false, error: ident.error };
  var config = getConfig();
  if (!config.rtdbUrl) return { ok: false, error: 'RTDB_URL not set.' };
  var prof = rtdbRead(config.rtdbUrl + '/users/' + ident.uid + '.json', config.rtdbSecret);
  if (!prof.ok || !prof.data) return { ok: false, error: 'No user profile.' };
  return { ok: true, user: {
    uid:   ident.uid,
    email: ident.email,
    role:  prof.data.role || 'club',
    club:  prof.data.club || null
  } };
}
