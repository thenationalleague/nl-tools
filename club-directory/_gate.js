/* =========================================================================
   NL Tools — Club Directory passcode gate (client half)
   File: /club-directory/_gate.js
   Version: v1.0 (04/08/2026)

   The browser half of the handshake in functions/club-directory.js. Shared by
   the editor and the reader, which differ only in what the granted claim lets
   them do.

   The dance, and why it is a dance rather than a function call:

     1. sign in anonymously. Identity Toolkit, not Cloud Run, so the org policy
        that blocks public invokers on callables does not apply.
     2. write { code, at } to authRequests/<uid>.
     3. an RTDB trigger validates server-side, deletes the request so a code
        never lingers in the database, and writes authGrants/<uid>.
     4. read the grant, delete both nodes while this uid still owns them, then
        sign in again with the custom token it carried.

   The code is never checked in the browser and the config holding it is not
   readable by any client, so the gate is a real boundary rather than a screen
   to get past. That is the whole difference from the uw-promo pattern, whose
   rules say `auth != null` and admit anyone who opens the page.

   Eventarc delivery costs seconds. Acceptable here: a person signs in once and
   the spinner covers it.

   Usage:
     NLGate.open({
       title: 'Club Directory',
       sub:   'Enter your six-digit code.',
       mount: document.getElementById('gate')
     }).then(function (session) { ... session.role, session.name ... });
   ========================================================================= */
(function () {
  'use strict';

  var ROOT = 'app-data/ops-club-directory';
  var ROSE = 'https://raw.githubusercontent.com/thenationalleague/tools/refs/heads/main/assets/crests/National%20League%20rose.png';
  /* Long enough to cover a cold start plus Eventarc, short enough that a
     genuinely dead function says so rather than spinning forever. */
  var TIMEOUT_MS = 45000;

  var esc = (window.NL && NL.escHtml) || function (s) { return String(s == null ? '' : s); };

  function el(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return d.firstElementChild;
  }

  /* One request, one answer. Resolves with the grant payload or rejects with a
     message already fit to show someone. */
  function exchange(payload) {
    var auth = firebase.auth(), db = firebase.database();
    return auth.signInAnonymously().then(function (cred) {
      var uid = cred.user.uid;
      var reqRef = db.ref(ROOT + '/authRequests/' + uid);
      var grantRef = db.ref(ROOT + '/authGrants/' + uid);

      return new Promise(function (resolve, reject) {
        var done = false;
        var timer = setTimeout(function () {
          if (done) { return; }
          done = true; grantRef.off();
          reject(new Error('The sign-in service did not answer. Please try again.'));
        }, TIMEOUT_MS);

        grantRef.on('value', function (snap) {
          var g = snap.val();
          if (!g || done) { return; }
          done = true;
          clearTimeout(timer);
          grantRef.off();
          /* Clear both nodes while this uid still owns them — after the custom
             token sign-in the uid changes and the rules stop allowing it. */
          Promise.all([grantRef.remove().catch(function () {}),
                       reqRef.remove().catch(function () {})])
            .then(function () {
              if (!g.ok) { reject(new Error(g.error || 'Code not recognised.')); return; }
              resolve(g);
            });
        }, function (err) {
          if (done) { return; }
          done = true; clearTimeout(timer); reject(err);
        });

        var body = { at: firebase.database.ServerValue.TIMESTAMP };
        Object.keys(payload).forEach(function (k) { body[k] = payload[k]; });
        reqRef.set(body).catch(function (err) {
          if (done) { return; }
          done = true; clearTimeout(timer); grantRef.off(); reject(err);
        });
      });
    }).then(function (g) {
      return firebase.auth().signInWithCustomToken(g.customToken).then(function () {
        return { role: g.role, name: g.name };
      });
    });
  }

  /* Renders the gate and resolves once someone is through it. Never resolves
     if they never get through — that is the point. */
  function open(opts) {
    opts = opts || {};
    var mount = opts.mount || document.body;

    return new Promise(function (resolve) {
      var card = el(
        '<div class="gate"><div class="gate__card">' +
          '<img class="gate__logo" src="' + ROSE + '" alt="National League">' +
          '<div class="gate__title">' + esc(opts.title || 'Sign in') + '</div>' +
          '<div class="gate__sub" data-sub>' + esc(opts.sub || 'Enter your six-digit code.') + '</div>' +
          '<input class="gate__input" data-in inputmode="numeric" autocomplete="one-time-code" ' +
            'maxlength="6" placeholder="••••••" aria-label="Six-digit code">' +
          '<div class="gate__err" data-err role="alert"></div>' +
        '</div></div>');
      mount.innerHTML = '';
      mount.appendChild(card);

      var input = card.querySelector('[data-in]');
      var err = card.querySelector('[data-err]');
      var sub = card.querySelector('[data-sub]');
      var busy = false;

      function fail(msg) {
        busy = false;
        input.disabled = false;
        sub.textContent = opts.sub || 'Enter your six-digit code.';
        err.textContent = msg;
        input.value = '';
        input.focus();
      }

      function submit() {
        var code = (input.value || '').replace(/[^0-9]/g, '');
        if (busy || code.length !== 6) { return; }
        busy = true;
        err.textContent = '';
        input.disabled = true;
        sub.textContent = 'Checking…';
        exchange({ code: code })
          .then(function (session) { resolve(session); })
          .catch(function (e) { fail((e && e.message) || 'Something went wrong.'); });
      }

      /* Six digits is the whole credential, so submit on the sixth rather than
         asking for a keypress that adds nothing. */
      input.addEventListener('input', function () {
        var v = input.value.replace(/[^0-9]/g, '').slice(0, 6);
        if (v !== input.value) { input.value = v; }
        err.textContent = '';
        if (v.length === 6) { submit(); }
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { submit(); }
      });
      setTimeout(function () { input.focus(); }, 30);
    });
  }

  /* The portal route, for whoever holds the master key. Uses the caller's
     existing auth-guard session instead of a code, and the trigger checks the
     role server-side. */
  function openAsAdmin() {
    return exchange({ admin: true });
  }

  window.NLGate = { open: open, openAsAdmin: openAsAdmin, ROOT: ROOT };
}());
