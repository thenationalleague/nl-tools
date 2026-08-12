/* Judgements & Decisions — GENERATED FILE, DO NOT EDIT.
 *
 * Built from embeds/judgements.html by scripts/build-embeds.js.
 * Edit the HTML file and let CI regenerate this.
 *
 * Embed on the public site with:
 *   <div data-nl-judgements></div>
 *   <script src="https://nl.tools/embeds/judgements.js" defer></script>
 *
 * If the CMS strips <script src>, use an inline loader instead:
 *   <div data-nl-judgements></div>
 *   <script>
 *     (function(){var s=document.createElement('script');
 *      s.src='https://nl.tools/embeds/judgements.js';document.body.appendChild(s);})();
 *   </script>
 */
(function () {
  'use strict';

  // Guard against the snippet appearing twice on one page — the widget owns
  // fixed element IDs, so a second copy would fight the first.
  if (window.__nlJudgementsMounted) {
    if (window.console && console.warn) {
      console.warn('[Judgements & Decisions] already mounted on this page — ignoring duplicate embed.');
    }
    return;
  }
  window.__nlJudgementsMounted = true;

  var VERSION = "v1.8";
  var CSS = "\n#nlJudgements { max-width: 720px; margin: 0 auto; }\n#nlJudgements .nlj-table {\n  width: 100%;\n  border-collapse: collapse;\n  background: #ffffff;\n  border: 1px solid #dde3ed;\n  border-radius: 6px;\n  overflow: hidden;\n  font-size: 14px;\n  font-family: inherit;\n}\n#nlJudgements .nlj-table th {\n  background: #223b7c;\n  color: #ffffff;\n  font-weight: 800;\n  font-size: 10px;\n  text-transform: uppercase;\n  letter-spacing: 0.1em;\n  padding: 12px 14px;\n  text-align: left;\n  white-space: nowrap;\n}\n#nlJudgements .nlj-table td {\n  padding: 11px 14px;\n  border-bottom: 1px solid #dde3ed;\n  vertical-align: middle;\n}\n#nlJudgements .nlj-table tr:last-child td { border-bottom: none; }\n#nlJudgements .nlj-table tr:hover td { background: #f4f6f9; }\n#nlJudgements .nlj-club { font-weight: 700; }\n#nlJudgements .nlj-empty {\n  text-align: center;\n  padding: 40px 16px;\n  color: #5a6a82;\n  font-size: 13px;\n  font-weight: 600;\n}\n@media (max-width: 520px) {\n  #nlJudgements .nlj-table thead { display: none; }\n  #nlJudgements .nlj-table tr { display: block; border-bottom: 1px solid #dde3ed; padding: 12px 14px; }\n  #nlJudgements .nlj-table tr:last-child { border-bottom: none; }\n  #nlJudgements .nlj-table td { display: block; padding: 2px 0; border-bottom: none; white-space: normal !important; }\n  #nlJudgements .nlj-table td::before {\n    content: attr(data-label);\n    font-size: 10px;\n    font-weight: 800;\n    text-transform: uppercase;\n    letter-spacing: 0.08em;\n    color: #5a6a82;\n    display: block;\n    margin-bottom: 1px;\n  }\n}\n";
  var HTML = "<div id=\"nlJudgements\">\n  <table class=\"nlj-table\">\n    <thead>\n      <tr>\n        <th>Club</th>\n        <th>Rule breached</th>\n        <th>Start date</th>\n        <th>End date</th>\n      </tr>\n    </thead>\n    <tbody id=\"nlJudgementsBody\">\n      <tr><td colspan=\"4\" class=\"nlj-empty\">Loading…</td></tr>\n    </tbody>\n  </table>\n</div>";

  function mount() {
    // Mount into the host page's marker div. Falling back to appending our
    // own container means a missing marker degrades to "renders at the
    // bottom" rather than "renders nowhere".
    var host = document.querySelector('[data-nl-judgements]');
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-nl-judgements', '');
      document.body.appendChild(host);
      if (window.console && console.warn) {
        console.warn('[Judgements & Decisions] no [data-nl-judgements] element found — appended to <body>.');
      }
    }

    var style = document.createElement('style');
    style.setAttribute('data-nl-embed', "embeds/judgements.js");
    style.textContent = CSS;
    document.head.appendChild(style);

    // Markup must be in the DOM before the widget runs — its IIFE resolves
    // every element by ID at the top and does not wait for DOMContentLoaded.
    host.innerHTML = HTML;

    if (window.console && console.info) {
      console.info('[Judgements & Decisions] ' + VERSION + ' mounted.');
    }


    (function() {
      /* Dynamically load Firebase SDK to bypass CMS script-src stripping */
      var scripts = [
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.7.1/firebase-database-compat.js'
      ];
      var loaded = 0;

      function onAllLoaded() {
        var app;
        try {
          app = firebase.app('nlj-widget');
        } catch(e) {
          app = firebase.initializeApp({
            apiKey:            'AIzaSyC3az3OMnU7TdqlaWp8yrO_EjgZ36l-mXU',
            authDomain:        'nl-tools.firebaseapp.com',
            databaseURL:       'https://nl-tools-default-rtdb.europe-west1.firebasedatabase.app',
            projectId:         'nl-tools',
            storageBucket:     'nl-tools.firebasestorage.app',
            messagingSenderId: '801354670005',
            appId:             '1:801354670005:web:05d8ebad3e7e63610d03fc'
          }, 'nlj-widget');
        }

        var db = firebase.database(app);
        db.ref('app-data/ops-judgements/records').once('value').then(function(snap) {
          var val = snap.val();
          var records = [];
          if (val && typeof val === 'object') {
            Object.keys(val).forEach(function(key) {
              var r = val[key];
              r.id = key;
              records.push(r);
            });
          }

          var today = new Date();
          today.setHours(0, 0, 0, 0);
          var cutoff = new Date(today);
          cutoff.setDate(cutoff.getDate() - 30);

          var visible = records.filter(function(r) {
            if (!r.endDate) return true;
            var end = parseDate(r.endDate);
            return end >= cutoff;
          });

          visible.sort(compareRecords(today));

          render(visible);
        }).catch(function(err) {
          console.warn('Judgements widget error:', err);
          document.getElementById('nlJudgementsBody').innerHTML =
            '<tr><td colspan="4" class="nlj-empty">Unable to load data.</td></tr>';
        });
      }

      /* Which batch a record belongs to. 0 = concluded (an end date that has
         passed), 1 = ongoing (no end date, or one still to come). Matches the
         Active/Resolved split the internal tool derives, so the two views
         never disagree about a record. */
      function batchOf(r, today) {
        if (!r.endDate) return 1;
        var end = parseDate(r.endDate);
        return (end && end < today) ? 0 : 1;
      }

      /* Concluded records first, then ongoing. Inside each batch the date that
         matters leads: when it finished for concluded records, when it started
         for ongoing ones — earliest first either way. Same date, alphabetical
         by club. ISO yyyy-mm-dd strings sort chronologically as text, so the
         dates are compared without parsing. */
      function compareRecords(today) {
        return function(a, b) {
          var ba = batchOf(a, today);
          var bb = batchOf(b, today);
          if (ba !== bb) return ba - bb;

          var ka = (ba === 0 ? a.endDate : a.startDate) || '';
          var kb = (bb === 0 ? b.endDate : b.startDate) || '';
          if (ka !== kb) return ka.localeCompare(kb);

          return (a.club || '').localeCompare(b.club || '');
        };
      }

      function loadNext() {
        if (loaded >= scripts.length) { onAllLoaded(); return; }
        var s = document.createElement('script');
        s.src = scripts[loaded];
        s.onload = function() { loaded++; loadNext(); };
        s.onerror = function() {
          console.warn('Failed to load: ' + scripts[loaded]);
          document.getElementById('nlJudgementsBody').innerHTML =
            '<tr><td colspan="4" class="nlj-empty">Unable to load data.</td></tr>';
        };
        document.head.appendChild(s);
      }

      loadNext();

      function render(records) {
        var tbody = document.getElementById('nlJudgementsBody');
        if (!tbody) return;

        if (records.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="nlj-empty">There are no current judgements or decisions to display.</td></tr>';
          return;
        }

        var html = records.map(function(r) {
          var endDisplay = r.endDate ? formatDate(r.endDate) : 'Ongoing';
          return '<tr>'
            + '<td data-label="Club" class="nlj-club">' + esc(r.club || '') + '</td>'
            + '<td data-label="Rule breached">' + esc(r.rule || '') + '</td>'
            + '<td data-label="Start date" style="white-space:nowrap;">' + formatDate(r.startDate) + '</td>'
            + '<td data-label="End date" style="white-space:nowrap;">' + esc(endDisplay) + '</td>'
            + '</tr>';
        }).join('');

        tbody.innerHTML = html;
      }

      function parseDate(str) {
        var parts = String(str || '').split('-');
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }

      function formatDate(str) {
        if (!str) return '';
        var d = parseDate(str);
        var day = d.getDate();
        var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        return day + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
      }

      function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    })();

  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
