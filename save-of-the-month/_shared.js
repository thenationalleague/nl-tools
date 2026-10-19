/* Save of the Month — pure logic shared by both pages and tests/save-of-the-month.test.mjs.
   Version: v4.0 (19/10/2026)
   File: /save-of-the-month/_shared.js
   v4.0 (19/10/2026): first build.

   No DOM, no Firebase, no NL.* — everything here is a pure function of its
   arguments, so the parts that quietly mislead a club if wrong (whether a
   month is open, which keeper was on the pitch at a minute, which matches
   count as league matches) are testable in node. */
(function (root) {
  'use strict';

  var SOTM = {};
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  SOTM.MAX_PER_CLUB = 5;
  SOTM.SLOTS = ['s1', 's2', 's3', 's4', 's5'];
  SOTM.MAX_CLIP_BYTES = 100 * 1024 * 1024;   /* the Storage rule's cap */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  SOTM.isMonthKey = function (k) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(k || '')); };

  /* '2026-09' → 'September 2026'. */
  SOTM.monthLabel = function (k) {
    if (!SOTM.isMonthKey(k)) return String(k || '');
    return MONTHS[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4);
  };

  SOTM.ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  /* The month before `d`, as a key — what you normally open: October's
     nominations are collected in November. */
  SOTM.previousMonth = function (d) {
    var y = d.getFullYear(), m = d.getMonth();   /* 0-based, so m is already "last month" + 1 */
    if (m === 0) { y--; m = 12; }
    return y + '-' + pad(m);
  };

  /* A closing date is the whole of that day, in the browser's local time
     (UK for everyone who sets one). */
  SOTM.endOfDay = function (ymd) {
    var p = String(ymd).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59, 999).getTime();
  };

  /* Open = a month is set and its closing date (if any) has not passed. The
     rules make the same test with the server's clock; this is the screen. */
  SOTM.isOpen = function (config, nowMs) {
    if (!config || !SOTM.isMonthKey(config.month)) return false;
    return !(typeof config.closesAt === 'number' && nowMs > config.closesAt);
  };

  /* First slot not yet used, or null at the limit. */
  SOTM.freeSlot = function (mine) {
    mine = mine || {};
    for (var i = 0; i < SOTM.SLOTS.length; i++) if (!mine[SOTM.SLOTS[i]]) return SOTM.SLOTS[i];
    return null;
  };

  /* nominations/<month> + shortlist/<month> → one row per nomination. */
  SOTM.flatten = function (byClub, shortByClub) {
    var out = [];
    Object.keys(byClub || {}).forEach(function (club) {
      var slots = byClub[club] || {};
      Object.keys(slots).forEach(function (slot) {
        if (!slots[slot]) return;
        out.push({ club: club, slot: slot, rec: slots[slot],
          short: !!(shortByClub && shortByClub[club] && shortByClub[club][slot]) });
      });
    });
    return out;
  };

  SOTM.mb = function (bytes) {
    if (typeof bytes !== 'number') return '';
    return (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + 'MB';
  };

  /* A file name safe for a Storage path. */
  SOTM.safeName = function (name) {
    return String(name || 'clip').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  };

  root.SOTM = SOTM;
})(typeof window !== 'undefined' ? window : globalThis);
