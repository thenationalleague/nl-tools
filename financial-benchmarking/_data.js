/* =============================================================================
   NL Tools — Financial Benchmarking: data layer
   File: /financial-benchmarking/_data.js
   Version: v0.4 (11/11/2026)

   CHANGELOG
     v0.4 (11/11/2026) — Finance's review. National: the return is the SCMP,
       not the FQR; income to date sits beside the budget and is renamed;
       income as % of budget is gone; wages are a share of BUDGETED income
       (wagesOfBudget replaces wagesOfIncome). North and South: panels first,
       ratios after, all four percentages retitled. Every figure is ranked.
     v0.3 (10/11/2026) — North and South gain the budgeted squad cost ratio
       (playing squad budget as % of income budget), beside the ratio to
       date. Each set says how the club view lays its figures out (`lead`,
       `panels`); budgets carry a size rank (rankOf, ordinal).
     v0.2 (10/11/2026) — Club names as the returns sheet writes them are
       recognised: "Utd" and the like are read in full, and a name that
       differs only in its last word ("Town", "United") matches when it can
       mean one club only.
     v0.1 (10/11/2026) — First build. Reads a financial return as pasted from
       the spreadsheet, works out each club's derived figures, and builds the
       nameless comparison lists a club is shown against.

   Pure functions only — no DOM, no Firebase — so
   tests/financial-benchmarking.test.mjs can run them in Node.

   TWO SETS OF FIGURES, BY DIVISION (settled 10/11/2026)
     national  The National division's return: a season income budget, then
               the quarter's actuals line by line (match revenue, commercial,
               non-matchday, transfers, player wages, manager wages).
     step2     North and South: season income and playing squad budgets, and
               the return's income and player spend against each.
   The two share only Income Budget, so a National club is compared with
   National clubs and nobody else; North and South may be compared together.

   BUDGETS ARE FOR THE SEASON, ACTUALS ARE THE RUNNING TOTAL to the end of the
   quarter. So a percentage here is "share of the season's budget used so
   far" and climbs towards 100 over the four returns. It is not performance
   against a quarterly plan, and the page passes no judgement on it.

   WHAT A CLUB IS COMPARED AGAINST. bench/<division>/<metric> is the list of
   every club's figure for that one metric, sorted, with no names. Each list
   is sorted on its own, so position 3 in one list and position 3 in another
   are not the same club: the lists cannot be joined back into a club's row.
   ============================================================================= */
(function (root) {
  'use strict';

  var QUARTERS = ['q1', 'q2', 'q3', 'q4'];
  /* A return is named for its regime: North and South file the FQR, the
     National division the SCMP. With no set given it reads as the FQR. */
  function quarterLabel(q, set) {
    return (set === 'national' ? 'SCMP' : 'FQR') + String(q || '').replace(/\D/g, '');
  }

  function sum() {
    var t = 0;
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i] == null) return null;
      t += arguments[i];
    }
    return t;
  }
  /* A percentage of nothing is no figure, not zero and not infinity. */
  function pct(part, whole) {
    if (part == null || whole == null || whole <= 0) return null;
    return part / whole * 100;
  }

  /* `match` is tested against the header with everything but letters and
     digits removed, lowercased — headings arrive as "INCOME BUDGET",
     "Commercial/Sponsorship", "TRANSFER INCOME/(SPEND)". The % columns in
     the sheet are not read: they are worked out here from the figures, so a
     stale formula in the sheet cannot disagree with the numbers beside it. */
  var SETS = {
    national: {
      divisions: ['National'],
      fields: [
        { key: 'incomeBudget', match: /^incomebudget/ },
        { key: 'matchRevenue', match: /^matchrevenue/ },
        { key: 'commercial',   match: /^commercial/ },
        { key: 'nonMatchday',  match: /^nonmatchday/ },
        { key: 'transfers',    match: /^transfer/ },
        { key: 'playerWages',  match: /^playerwages/ },
        { key: 'managerWages', match: /^managerwages/ }
      ],
      /* Order and wording are finance's (11/11/2026): the budget and the
         income to date lead, side by side; income is not shown as a share of
         budget; wages are measured against the BUDGETED income, not the
         income so far, which early in a season would overstate every club. */
      groups: [
        { title: 'Revenue', metrics: [
          { key: 'incomeBudget', label: 'Income budget', kind: 'money' },
          { key: 'income',       label: '{Q} income excluding transfers, distributions, parachute payments, and prize money', kind: 'money' },
          { key: 'matchRevenue', label: 'Match revenue', kind: 'money' },
          { key: 'commercial',   label: 'Commercial and sponsorship', kind: 'money' },
          { key: 'nonMatchday',  label: 'Non-matchday', kind: 'money' },
          { key: 'transfers',    label: 'Transfer income / (spend)', kind: 'money' }
        ] },
        { title: 'Costs', metrics: [
          { key: 'playerWages',   label: 'Player wages', kind: 'money' },
          { key: 'managerWages',  label: 'Manager wages', kind: 'money' },
          { key: 'wagesOfBudget', label: 'Wages as % of budgeted income', kind: 'pct' }
        ] }
      ],
      derive: function (v) {
        return {
          income: sum(v.matchRevenue, v.commercial, v.nonMatchday),
          wagesOfBudget: pct(sum(v.playerWages, v.managerWages), v.incomeBudget)
        };
      }
    },
    step2: {
      divisions: ['North', 'South'],
      fields: [
        { key: 'incomeBudget', match: /^incomebudget/ },
        { key: 'fqrIncome',    match: /^fqr\d?income/ },
        { key: 'squadBudget',  match: /^playingsquadbudget/ },
        { key: 'playerSpend',  match: /^fqr\d?playerspend/ }
      ],
      /* HOW THE CLUB VIEW LAYS THESE OUT (finance's order, 11/11/2026).
         Two panels first, Income and Playing squad, each a budget with the
         share of it received or spent so far. Below them, the two squad
         cost ratios: what was budgeted, and what the return shows. (An
         earlier layout led with the ratios; finance asked for them last.) */
      panels: [
        { title: 'Income', budget: 'incomeBudget', actual: 'fqrIncome', pct: 'incomePct',
          actualLabel: 'received', pctLabel: '{Q} income as a % of budgeted income' },
        { title: 'Playing squad', budget: 'squadBudget', actual: 'playerSpend', pct: 'spendPct',
          actualLabel: 'spent', pctLabel: '{Q} player spend as a % of budgeted player spend' }
      ],
      ratios: {
        title: 'Squad spend against income',
        metrics: ['budgetRatio', 'spendOfIncome']
      },
      groups: [
        { title: 'Income', metrics: [
          { key: 'incomeBudget', label: 'Income budget', kind: 'money' },
          { key: 'fqrIncome',    label: '{Q} income', kind: 'money' },
          { key: 'incomePct',    label: '{Q} income as a % of budgeted income', kind: 'pct' }
        ] },
        { title: 'Playing squad', metrics: [
          { key: 'squadBudget',   label: 'Playing squad budget', kind: 'money' },
          { key: 'playerSpend',   label: '{Q} player spend', kind: 'money' },
          { key: 'spendPct',      label: '{Q} player spend as a % of budgeted player spend', kind: 'pct' }
        ] },
        { title: 'Squad spend against income', metrics: [
          { key: 'budgetRatio',   label: 'Budgeted squad spend as a % of income', kind: 'pct' },
          { key: 'spendOfIncome', label: '{Q} squad spend as a % of {Q} income', kind: 'pct' }
        ] }
      ],
      derive: function (v) {
        return {
          incomePct: pct(v.fqrIncome, v.incomeBudget),
          spendPct: pct(v.playerSpend, v.squadBudget),
          budgetRatio: pct(v.squadBudget, v.incomeBudget),
          spendOfIncome: pct(v.playerSpend, v.fqrIncome)
        };
      }
    }
  };

  function setFor(div) {
    if (div === 'National') return 'national';
    if (div === 'North' || div === 'South') return 'step2';
    return null;
  }

  function metricsOf(set) {
    var out = [];
    ((SETS[set] || {}).groups || []).forEach(function (g) {
      g.metrics.forEach(function (m) { out.push(m); });
    });
    return out;
  }

  /* Every figure a club has for its set: the stored ones and the derived. */
  function figures(set, v) {
    var def = SETS[set];
    if (!def) return {};
    v = v || {};
    var d = def.derive(v), out = {};
    metricsOf(set).forEach(function (m) {
      var n = (m.key in d) ? d[m.key] : v[m.key];
      out[m.key] = (typeof n === 'number' && isFinite(n)) ? n : null;
    });
    return out;
  }

  /* "£1,234", "1,234.50", "(1,234)" for a negative, "-" or blank for none.
     A cell that is not a number at all is no figure, never zero: a zero
     would sit at the bottom of every comparison as if it had been reported. */
  function parseNum(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    s = String(s == null ? '' : s).trim();
    if (!s || /^[-–—]+$/.test(s)) return null;
    var neg = /^\(.*\)$/.test(s) || /^[-–—]/.test(s);
    var t = s.replace(/[£,\s%()]/g, '').replace(/^[-–—+]/, '');
    if (!/^\d*\.?\d+$/.test(t)) return null;
    var n = parseFloat(t);
    return neg ? -n : n;
  }

  function normHead(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* Names as a spreadsheet writes them against names as clubs-meta holds
     them: case, punctuation, "FC" / "AFC" and "&" all vary, and the returns
     sheet abbreviates ("Maidstone Utd"). */
  var ABBREV = { utd: 'united', ath: 'athletic', tn: 'town', boro: 'borough',
                 wdrs: 'wanderers', rvrs: 'rovers', rov: 'rovers', utds: 'united' };
  function normName(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\b(afc|fc|the)\b/g, ' ')
      .replace(/\s+/g, ' ').trim()
      .split(' ').map(function (w) { return ABBREV[w] || w; }).join(' ');
  }
  /* The name without its last word when that word is the kind clubs share
     ("Town", "United"): "Maidstone", from "Maidstone United" or "Maidstone
     Utd". Used only where it points at exactly one club. */
  function stem(s) {
    return normName(s).replace(/ (united|town|city|athletic|rovers|wanderers|borough|harriers|angels|invicta|moors)$/, '');
  }

  /* clubs: [{ name, short, code, division }] → fn(name) → club | null

     Exact names first (full, then short). A stem is a fallback and only
     counts when one club has it: two clubs sharing a stem match neither, and
     the admin is asked which is meant. A wrong guess here would put one
     club's finances on another club's page. */
  function resolver(clubs) {
    var idx = {}, stems = {};
    (clubs || []).forEach(function (c) {
      if (!c || !c.code || !c.division) return;
      [c.name, c.short].forEach(function (n) {
        var k = normName(n);
        if (k && !idx[k]) idx[k] = c;
      });
      var st = stem(c.name);
      if (st) stems[st] = (st in stems && stems[st] !== c) ? null : c;
    });
    return function (name) {
      return idx[normName(name)] || stems[stem(name)] || null;
    };
  }

  /* A return as pasted from the spreadsheet (tab-separated, header row
     included). The header row is the one with a "Club" cell — the National
     sheet has a REVENUE / COSTS banner row above it, which is skipped.

     Returns { set, rows, unmatched, errors }.
       rows       [{ name, code, div, v }]   ready to save
       unmatched  [{ name, v }]              club not recognised; the admin
                                             page asks which club it is
       errors     [string]                   reasons nothing can be saved */
  function parsePaste(text, resolve) {
    var out = { set: null, rows: [], unmatched: [], errors: [] };
    var lines = String(text || '').replace(/\r/g, '').split('\n')
      .map(function (l) { return l.split('\t'); });

    var h = -1, clubCol = -1;
    for (var i = 0; i < lines.length && h < 0; i++) {
      for (var j = 0; j < lines[i].length; j++) {
        if (normHead(lines[i][j]) === 'club') { h = i; clubCol = j; break; }
      }
    }
    if (h < 0) {
      out.errors.push('No heading row found. Copy the sheet with its headings, including the "Club" column.');
      return out;
    }
    var heads = lines[h].map(normHead);
    var has = function (re) { return heads.some(function (x) { return re.test(x); }); };
    out.set = has(/^matchrevenue/) ? 'national' : has(/^playingsquadbudget/) ? 'step2' : null;
    if (!out.set) {
      out.errors.push('These headings are not a return this page knows. It needs either "Match Revenue" (National) or "Playing Squad Budget" (North and South).');
      return out;
    }
    var def = SETS[out.set], cols = {};
    def.fields.forEach(function (f) {
      for (var c = 0; c < heads.length; c++) {
        if (f.match.test(heads[c])) { cols[f.key] = c; return; }
      }
      out.errors.push('Column missing: ' + f.key + '.');
    });
    if (out.errors.length) return out;

    var seen = {};
    for (var r = h + 1; r < lines.length; r++) {
      var cells = lines[r];
      var name = String(cells[clubCol] == null ? '' : cells[clubCol]).trim();
      if (!name) continue;
      var v = {}, any = false;
      def.fields.forEach(function (f) {
        var n = parseNum(cells[cols[f.key]]);
        if (n != null) { v[f.key] = n; any = true; }
      });
      if (!any) continue;
      var club = resolve ? resolve(name) : null;
      if (!club) { out.unmatched.push({ name: name, v: v }); continue; }
      if (def.divisions.indexOf(club.division) < 0) {
        out.errors.push(club.name + ' is a ' + club.division + ' club, and this is the ' +
          (out.set === 'national' ? 'National' : 'North and South') + ' return.');
        continue;
      }
      if (seen[club.code]) { out.errors.push(club.name + ' appears twice.'); continue; }
      seen[club.code] = true;
      out.rows.push({ name: club.name, code: club.code, div: club.division, v: v });
    }
    if (!out.rows.length && !out.unmatched.length && !out.errors.length) {
      out.errors.push('No club rows found under the headings.');
    }
    return out;
  }

  /* clubs: { <code>: { div, v } } → { <division>: { <metric>: [sorted] } } */
  function benchAll(clubs) {
    var out = {};
    Object.keys(clubs || {}).forEach(function (code) {
      var c = clubs[code] || {}, set = setFor(c.div);
      if (!set) return;
      var f = figures(set, c.v), b = out[c.div] = out[c.div] || {};
      Object.keys(f).forEach(function (k) {
        if (f[k] != null) (b[k] = b[k] || []).push(f[k]);
      });
    });
    Object.keys(out).forEach(function (d) {
      Object.keys(out[d]).forEach(function (k) {
        out[d][k].sort(function (a, b) { return a - b; });
      });
    });
    return out;
  }

  /* North and South together: the two divisions' lists for a metric, merged. */
  function combine(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function (src) {
      Object.keys(src).forEach(function (k) {
        out[k] = (out[k] || []).concat(list(src[k]));
      });
    });
    Object.keys(out).forEach(function (k) { out[k].sort(function (x, y) { return x - y; }); });
    return out;
  }

  /* RTDB hands a sparse or single-item array back as an object. */
  function list(x) {
    if (Array.isArray(x)) return x.filter(function (n) { return typeof n === 'number'; });
    if (x && typeof x === 'object') {
      return Object.keys(x).map(function (k) { return x[k]; })
        .filter(function (n) { return typeof n === 'number'; })
        .sort(function (a, b) { return a - b; });
    }
    return [];
  }

  function median(values) {
    var a = list(values);
    if (!a.length) return null;
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /* Where a figure sits by size: 1st is the largest. Clubs on the same
     figure share a place. Every figure carries it, at finance's request
     (11/11/2026); it was first held to budgets alone. "By size" is the whole
     claim — first is biggest, not best. */
  function rankOf(values, own) {
    var a = list(values);
    if (own == null || !a.length) return null;
    var above = 0;
    a.forEach(function (v) { if (v > own) above++; });
    return { rank: above + 1, of: a.length };
  }
  function ordinal(n) {
    var t = n % 100;
    if (t >= 11 && t <= 13) return n + 'th';
    return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  }

  function money(n) {
    if (n == null) return '';
    var r = Math.round(Math.abs(n));
    return (n < 0 && r !== 0 ? '-' : '') + '£' + r.toLocaleString('en-GB');
  }
  function percent(n) {
    if (n == null) return '';
    return (Math.round(n * 10) / 10).toFixed(1) + '%';
  }
  function format(kind, n) { return kind === 'pct' ? percent(n) : money(n); }

  /* "£120,000 above the North median". No rank: top of a spending list is
     not something to aim for, and "9th" reads as a table to climb. */
  function againstMedian(kind, own, med, who) {
    if (own == null || med == null) return '';
    var tail = ' the ' + who + ' median';
    if (kind === 'pct') {
      var dp = Math.round((own - med) * 10) / 10;
      if (dp === 0) return 'On' + tail;
      var a = Math.abs(dp).toFixed(1);
      return a + (a === '1.0' ? ' point ' : ' points ') + (dp > 0 ? 'above' : 'below') + tail;
    }
    var d = Math.round(own - med);
    if (d === 0) return 'On' + tail;
    return money(Math.abs(d)) + (d > 0 ? ' above' : ' below') + tail;
  }

  root.FBData = {
    QUARTERS: QUARTERS,
    SETS: SETS,
    quarterLabel: quarterLabel,
    setFor: setFor,
    metricsOf: metricsOf,
    figures: figures,
    parseNum: parseNum,
    normName: normName,
    resolver: resolver,
    parsePaste: parsePaste,
    benchAll: benchAll,
    combine: combine,
    list: list,
    median: median,
    rankOf: rankOf,
    ordinal: ordinal,
    money: money,
    percent: percent,
    format: format,
    againstMedian: againstMedian
  };
})(typeof window !== 'undefined' ? window : globalThis);
