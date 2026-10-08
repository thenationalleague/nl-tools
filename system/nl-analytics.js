/* =========================================================================
   NL Tools — nl-analytics.js
   Version: v1.0 (08/10/2026)
   File: /system/nl-analytics.js

   ONE GA4 tag for every page on nl.tools. Loaded from the canonical head
   like nl-brand.css and nl-utils.js, so a tool gets measured by being wired
   correctly rather than by somebody remembering to paste a snippet.

   WHY THIS FILE EXISTS
   The tag was written inline on /wellbeing-hub/ on 08/10/2026. The moment a
   second page wanted it, the repo's own rule applied — first use stays
   tool-local, the second time you would write it, promote it. Pasting a
   measurement id into sixty heads is how you end up with fifty-nine of them
   right.

   WHAT IT MEASURES
   Page views, by path. That is the question it was asked to answer: "how
   often was programme packs viewed". GA4's Pages and screens report shows
   /programme-packs/ with a count and a trend, and nothing here needs
   configuring per tool.

   COOKIELESS, DELIBERATELY — client_storage: 'none'
   No cookie is written and nothing is read from the device, which keeps every
   page on this domain outside PECR reg. 6 and means NO CONSENT BANNER
   ANYWHERE. A banner on /wellbeing-hub/ — a page somebody may open in a
   crisis — was never acceptable, and once one page is exempt it is simpler
   and more honest for the whole estate to be.

   The price is real and worth stating: with no client id, GA4 cannot tell a
   returning visitor from a new one, so "users" collapses towards "views".
   Counts and trends per page are sound; retention, funnels and
   user-scoped reports are not. If a question ever needs those, it needs a
   different instrument, not a cookie quietly added here.

   Consent Mode is deliberately NOT set to denied. Denied does not mean "send
   less" — it means gtag withholds the event and Google models a replacement,
   so the numbers stop being counts. Cookieless-and-sending beats
   consent-denied-and-modelled for this.

   Google Signals and ad personalisation are OFF and must stay off. Signals
   joins this traffic to signed-in Google profiles across sites, which is a
   different proposition entirely, and on the wellbeing pages the fact that
   somebody opened "Suicide and self-harm" is special-category health data
   under UK GDPR Art. 9.

   WHAT IT DOES NOT DO
   - No identity. It never sends a uid, an email, a club or a role, even on a
     gated tool where auth-guard knows all four. Who opened what is already
     recorded in RTDB under admin/audit (auth-guard writes page_opened on
     every tool open) and that is the right home for it: in-house, access
     controlled, and not shared with a third party.
   - No query strings or hashes beyond the path GA4 collects by default, and
     no free text. A tool that wants its own events calls NL.track() below
     and chooses what to send — never user input.

   THE MEASUREMENT ID IS PUBLIC. It ships in the HTML of every page by
   design; anyone can read it from the source. It is not the GA_PROPERTY_ID
   used by scripts/fetch-ga-metrics.js, which IS a secret and lives in
   Actions secrets.

   SEPARATE PROPERTY FROM THE PUBLIC WEBSITE, ON PURPOSE. This is the "NL
   Tools" property, not the one thenationalleague.org.uk reports into.
   fetch-ga-metrics.js queries that property by pagePath with no hostname
   filter and writes the file the Website Archive tool reads, so sharing a
   property would have quietly folded tool traffic into the league's website
   figures.

   CHANGELOG
   v1.0 (08/10/2026) — Promoted out of /wellbeing-hub/index.html and wired
     into the canonical head. Same property and settings as that page used;
     the hub keeps its own topic/helpline events and now calls NL.track()
     instead of gtag directly.
   ========================================================================= */

(function () {
  'use strict';

  window.NL = window.NL || {};

  /* The "NL Tools" GA4 property. A page may set window.NL_GA_ID before this
     script to point somewhere else — nothing does, and nothing should
     without a reason written down here. */
  var ID = window.NL_GA_ID || 'G-NJQ0XQ0XCK';

  /* A malformed id silently measures nothing, so refuse it loudly rather
     than leaving somebody to wonder why a tool has no traffic. */
  if (!/^G-[A-Z0-9]{6,}$/.test(ID)) {
    if (window.console && console.warn) {
      console.warn('[nl-analytics] not a GA4 measurement id, tag not loaded: ' + ID);
    }
    window.NL.track = function () {};
    return;
  }

  /* file:// and a local server are not the live site. Measuring them puts
     development traffic into the same reports as clubs and staff, which is
     how a quiet tool comes to look busy. */
  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '' ||
      location.protocol === 'file:') {
    window.NL.track = function () {};
    return;
  }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  gtag('js', new Date());
  gtag('config', ID, {
    client_storage: 'none',
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: true
  });

  var t = document.createElement('script');
  t.async = true;
  t.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ID);
  document.head.appendChild(t);

  /* ── NL.track(name, params) ───────────────────────────────────────────────
     For the things a page view cannot see — a hash route, a modal, a tap on
     a phone number. Safe to call unconditionally: it is a no-op when the tag
     did not load (bad id, localhost, blocker), and it never throws, because
     an analytics failure must not take a tool's own code down with it.

     DO NOT PASS USER INPUT. Send a stable name you chose, not what somebody
     typed. The search box on /wellbeing-hub/ reports that a search happened
     and never what it was. */
  window.NL.track = function (name, params) {
    if (typeof window.gtag !== 'function') return;
    try { window.gtag('event', name, params || {}); } catch (e) {}
  };
}());
