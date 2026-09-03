/* Commercial Compliance — pure logic shared by the page and tests/commercial-compliance.test.mjs.
   Version: v2.0 (24/08/2026)
   File: /commercial-compliance/_shared.js
   v2.0 (24/08/2026): requirement kinds — 'recurring' (cadence as before),
     'quota' (N deliveries per season, slots q1..qN all due at season end),
     'standing' (always-true requirement verified by monthly spot-check).
     appliesTo gains an optional per-club opt-in scope (e.g. a partnership
     only some clubs joined). Material fields gain kind/quotaTarget/scope/
     clubScope; assetId (presentation grouping) is deliberately cosmetic.

   No DOM, no Firebase, no NL.* — everything here is a pure function of its
   arguments so the period arithmetic and the versioning rules (the parts that
   silently corrupt a season of compliance records if wrong) are testable in
   node. Loaded by index.html before the app script; tests load it in a VM
   sandbox (same pattern as programme/_shared.js).

   Model recap (settled 24/08/2026):
   - An obligation spawns deadline-bearing PERIODS from its cadence
     (season | monthly | weekly). Status attaches to a period, per club.
   - Absent status = outstanding. Recorded states: compliant | non-compliant.
   - Material edits (partners, cadence, due rule, divisions, criteria) bump
     the obligation version; a recorded status keeps the version it satisfied.
     Title/notes edits are cosmetic and do not version.
   - Seasons run 1 July → 30 June (see NL.season.fromDate for the ruling).
*/
(function (root) {
  'use strict';

  var CC = {};

  /* ── states ─────────────────────────────────────────────────────────── */

  /* Absent = outstanding; only the other two are ever written to RTDB. */
  CC.STATES = ['outstanding', 'compliant', 'non-compliant'];

  CC.nextState = function (s) {
    var i = CC.STATES.indexOf(s || 'outstanding');
    return CC.STATES[(i + 1) % CC.STATES.length];
  };

  /* ── seasons ────────────────────────────────────────────────────────── */

  /* '2026' → { start: 1 Jul 2026, end: 30 Jun 2027 } (local midnight). */
  CC.seasonBounds = function (seasonKey) {
    var y = parseInt(seasonKey, 10);
    if (isNaN(y)) throw new Error('CC.seasonBounds: bad season key "' + seasonKey + '"');
    return { start: new Date(y, 6, 1), end: new Date(y + 1, 5, 30) };
  };

  /* '2026' → '2026-27' (mirrors NL.season.label's derived form). */
  CC.seasonLabel = function (seasonKey) {
    var y = parseInt(seasonKey, 10);
    if (isNaN(y)) return String(seasonKey);
    var nxt = String((y + 1) % 100);
    return y + '-' + (nxt.length < 2 ? '0' + nxt : nxt);
  };

  /* ── date helpers ───────────────────────────────────────────────────── */

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  CC.ymd = function (d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  };

  /* 'YYYY-MM-DD' → local Date, null on anything else. */
  CC.parseYmd = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  };

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }

  /* ── periods ────────────────────────────────────────────────────────── */

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* periodsFor(obligation, seasonKey) → [{ key, label, due }] in date order.
     Period keys are RTDB-safe path segments and stable across edits.

     kind 'quota'    → slots 'q1'..'qN' (N = quotaTarget, min 1), every slot
                       due at season end: a quota has no interim deadline,
                       so nothing shows overdue until the season closes short.
     kind 'standing' → the requirement is always true ("every programme
                       carries X"); verified by MONTHLY spot-check periods.
     kind 'recurring' (default) → by cadence:
       season  → 'season'; due dueDate 'YYYY-MM-DD' (default season end)
       monthly → 'YYYY-MM' (Jul..Jun); due dueDay 1..31 clamped (default
                 month end)
       weekly  → 'YYYY-MM-DD' (the Monday); due the following Sunday. */
  CC.periodsFor = function (oblig, seasonKey) {
    var bounds = CC.seasonBounds(seasonKey);

    if (oblig && oblig.kind === 'quota') {
      /* A quota starts as undated slots all due at season end; as the plan
         firms up each slot can be given a specific date (slotDates.qN), and
         a dated slot then goes overdue like any deadline. Dating a slot is
         scheduling, not a change to what is owed — deliberately NOT a
         material edit. Slot keys stay q1..qN regardless of dates: they are
         the status paths. */
      var target = Math.max(1, (oblig.quotaTarget | 0) || 1);
      var out = [];
      for (var q = 1; q <= target; q++) {
        var planned = CC.parseYmd(oblig.slotDates && oblig.slotDates['q' + q]);
        out.push({ key: 'q' + q, label: ordinal(q) + ' of ' + target, due: planned || bounds.end, planned: !!planned });
      }
      return out;
    }

    var cadence = (oblig && oblig.kind === 'standing') ? 'monthly'
      : (oblig && oblig.cadence) || 'season';

    if (cadence === 'season') {
      var due = CC.parseYmd(oblig && oblig.dueDate) || bounds.end;
      return [{ key: 'season', label: CC.seasonLabel(seasonKey) + ' season', due: due }];
    }

    if (cadence === 'monthly') {
      var out = [];
      for (var i = 0; i < 12; i++) {
        var y = bounds.start.getFullYear() + (i >= 6 ? 1 : 0);
        var m0 = (6 + i) % 12; /* Jul=6 … Jun=5 */
        var last = daysInMonth(y, m0);
        var day = (oblig && oblig.dueDay >= 1) ? Math.min(oblig.dueDay, last) : last;
        out.push({
          key: y + '-' + pad2(m0 + 1),
          label: MONTHS[m0] + ' ' + y,
          due: new Date(y, m0, day)
        });
      }
      return out;
    }

    if (cadence === 'weekly') {
      /* Mondays covering the season: first Monday on/before 1 Jul through
         the last Monday on/before 30 Jun. */
      var mon = new Date(bounds.start.getTime());
      mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
      var weeks = [];
      while (mon <= bounds.end) {
        var sun = new Date(mon.getTime());
        sun.setDate(sun.getDate() + 6);
        weeks.push({ key: CC.ymd(mon), label: 'w/c ' + pad2(mon.getDate()) + ' ' + MONTHS[mon.getMonth()], due: sun });
        mon = new Date(mon.getTime());
        mon.setDate(mon.getDate() + 7);
      }
      return weeks;
    }

    throw new Error('CC.periodsFor: unknown cadence "' + cadence + '"');
  };

  /* A period is overdue once TODAY is past its due date (day granularity:
     the due day itself is still on time). */
  CC.isOverdue = function (period, today) {
    var t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return t > period.due;
  };

  CC.duePeriods = function (oblig, seasonKey, today) {
    return CC.periodsFor(oblig, seasonKey).filter(function (p) { return CC.isOverdue(p, today); });
  };

  /* ── applicability ──────────────────────────────────────────────────── */

  /* divisions is a { National: true, North: true, South: true } map.
     clubScope (optional) is a per-club OPT-IN map — a partnership only some
     clubs joined (e.g. TIC Health). Empty/absent = every club in the
     selected divisions; non-empty = only the named clubs, division check
     still applying. clubCode may be omitted by division-level callers. */
  CC.appliesTo = function (oblig, division, clubCode) {
    if (!(oblig && oblig.divisions && oblig.divisions[division])) return false;
    var scope = oblig.clubScope;
    if (scope && Object.keys(scope).some(function (k) { return !!scope[k]; })) {
      return clubCode != null && !!scope[clubCode];
    }
    return true;
  };

  /* ── material edits / versioning ────────────────────────────────────── */

  function keySet(x) {
    if (!x) return [];
    var keys = Array.isArray(x) ? x.slice() : Object.keys(x).filter(function (k) { return !!x[k]; });
    return keys.sort();
  }
  function sameSet(a, b) { return keySet(a).join(' ') === keySet(b).join(' '); }
  function normStr(s) { return String(s == null ? '' : s).trim(); }
  function normNum(n) { return (n == null || n === '') ? null : +n; }

  CC.MATERIAL_FIELDS = ['partnerIds', 'kind', 'cadence', 'dueDate', 'dueDay', 'quotaTarget', 'divisions', 'clubScope', 'scope', 'criteria'];

  /* True when an edit changes WHAT is owed — partners, kind, cadence/quota,
     due rule, who owes it (divisions, club opt-ins, clubs vs central) or the
     acceptance criteria — so the obligation must version and existing
     statuses keep the version they satisfied. Title, notes and the asset
     grouping (assetId, pure presentation) are cosmetic. */
  CC.isMaterialEdit = function (oldO, newO) {
    oldO = oldO || {}; newO = newO || {};
    if (!sameSet(oldO.partnerIds, newO.partnerIds)) return true;
    if (normStr(oldO.kind || 'recurring') !== normStr(newO.kind || 'recurring')) return true;
    if (normStr(oldO.cadence || 'season') !== normStr(newO.cadence || 'season')) return true;
    if (normStr(oldO.dueDate) !== normStr(newO.dueDate)) return true;
    if (normNum(oldO.dueDay) !== normNum(newO.dueDay)) return true;
    if (normNum(oldO.quotaTarget) !== normNum(newO.quotaTarget)) return true;
    if (!sameSet(oldO.divisions, newO.divisions)) return true;
    if (!sameSet(oldO.clubScope, newO.clubScope)) return true;
    if (normStr(oldO.scope || 'clubs') !== normStr(newO.scope || 'clubs')) return true;
    if (normStr(oldO.criteria) !== normStr(newO.criteria)) return true;
    return false;
  };

  /* ── rollup ─────────────────────────────────────────────────────────── */

  /* One club × one obligation, across the season's periods.
       periods    from CC.periodsFor
       statusMap  { periodKey: { state, … } } for that club (may be empty)
       today      Date
     → { due, met, failed, open, future, state } where state is one of
       'failed'  any period recorded non-compliant (judged failure wins)
       'overdue' a past-due period with nothing recorded
       'clear'   everything due is met (or met early, nothing due yet)
       'none'    nothing due yet, nothing recorded. */
  CC.clubRollup = function (periods, statusMap, today) {
    statusMap = statusMap || {};
    var due = 0, met = 0, failed = 0, open = 0, future = 0, earlyMet = 0;
    periods.forEach(function (p) {
      var rec = statusMap[p.key];
      var state = rec && rec.state;
      if (state === 'non-compliant') failed++;
      if (CC.isOverdue(p, today)) {
        due++;
        if (state === 'compliant') met++;
        else if (state !== 'non-compliant') open++;
      } else {
        future++;
        if (state === 'compliant') earlyMet++;
      }
    });
    var state = failed ? 'failed'
      : open ? 'overdue'
      : (met + earlyMet) ? 'clear'
      : 'none';
    return { due: due, met: met, failed: failed, open: open, future: future, state: state };
  };

  /* Past-due periods with nothing recorded — the escalation list's raw
     material for one club × one obligation. */
  CC.overdueOpen = function (periods, statusMap, today) {
    statusMap = statusMap || {};
    return periods.filter(function (p) {
      var rec = statusMap[p.key];
      return CC.isOverdue(p, today) && !(rec && rec.state);
    });
  };

  root.CC = CC;
})(typeof window !== 'undefined' ? window : globalThis);
