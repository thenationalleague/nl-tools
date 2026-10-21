/* Save of the Month — pure logic shared by both pages and tests/save-of-the-month.test.mjs.
   Version: v16.0 (21/10/2026)
   File: /save-of-the-month/_shared.js
   v16.0 (21/10/2026): clip cap 100MB -> 250MB, with the Storage rule.
   v14.0 (21/10/2026): no cap on nominations (slots s1..s5 go; records are
     push keys). keepersInMatch lists every goalkeeper who played, for the
     keeper dropdown. clipsOf reads several clips per nomination (and the
     old single `clip`). leagueMatches carries team ids and scores for the
     match cards.
   v8.0 (19/10/2026): month labels and the previous month moved to canon
     (NL.month, nl-utils v1.45); isMonthKey stays for isOpen, which the
     node tests run without NL.
   v4.0 (19/10/2026): first build.

   No DOM, no Firebase, no NL.* — everything here is a pure function of its
   arguments, so the parts that quietly mislead a club if wrong (whether a
   month is open, which keeper was on the pitch at a minute, which matches
   count as league matches) are testable in node. */
(function (root) {
  'use strict';

  var SOTM = {};

  SOTM.MAX_CLIP_BYTES = 250 * 1024 * 1024;   /* the Storage rule's cap */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  SOTM.isMonthKey = function (k) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(k || '')); };

  SOTM.ymd = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

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

  /* ── the NLS feed ─────────────────────────────────────────────────────
     Shapes verified against live responses on 19/10/2026 (matches list and
     match detail, ~270 league matches of 2026/27) — not written from memory.
     Worked example: g2660201, Worthing 5-0 Solihull Moors, a half-time
     keeper change logged as eventTime 45, eventPeriod "2". */

  /* National League, North, South. Not the NL Cup or any other cup: the
     list endpoint filtered by teamID returns every competition, so this is
     the filter. */
  SOTM.LEAGUE_COMPS = [89, 373, 372];

  /* The UTC window the list endpoint takes for a month. */
  SOTM.monthRange = function (k) {
    var y = +k.slice(0, 4), m = +k.slice(5, 7);
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: k + '-01 00:00:00Z', to: k + '-' + pad(last) + ' 23:59:59Z' };
  };

  /* matches-list `data[]` → the club's played league matches, oldest first:
     { id, date: 'YYYY-MM-DD', label: 'Worthing 5–0 Solihull Moors' }. */
  SOTM.leagueMatches = function (data) {
    return (data || []).filter(function (m) {
      var a = m && m.attributes;
      if (!a || SOTM.LEAGUE_COMPS.indexOf(+a.competitionID) < 0) return false;
      var p = String(a.matchPeriod || '').toLowerCase();
      return p === 'fulltime' || p === 'postmatch';
    }).map(function (m) {
      var a = m.attributes, h = a.homeTeam || {}, w = a.awayTeam || {};
      return {
        id: String(m.id),
        date: String(a.kickOffDateUTC || '').slice(0, 10),
        label: h.name + ' ' + h.score + '–' + w.score + ' ' + w.name,
        home: { id: h.teamID, name: h.name, score: h.score },
        away: { id: w.teamID, name: w.name, score: w.score }
      };
    }).sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
  };

  SOTM.playerName = function (p) {
    var n = (p && p.playerName) || {};
    return n.customKnownName || n.knownName || [n.firstName, n.lastName].filter(Boolean).join(' ');
  };

  /* The club's keeper on the pitch at `minute`, from a match detail's
     matchTeams[] entry: { id, name }, or null when the lineup cannot say —
     the club then types the name.

     · The starting keeper is the one Start[] entry whose playerPosition is
       Goalkeeper. None, or two (both happen in this season's data), is
       null: guessing a name into a club's nomination is worse than asking.
     · A substitution takes effect for minutes AFTER its eventTime. That one
       rule covers the half-time change (eventTime 45, period "2": a save in
       the 45th minute was the first keeper's) and an in-play change.
     · Players are looked up by subOffID / subOnID in THIS match's own lists.
       The subOffPlayer / subOnPlayer objects inside a substitution are stale
       copies from other matches — wrong position, wrong team. */
  SOTM.keeperAt = function (team, minute) {
    var pl = (team && team.players) || {};
    var start = pl.Start || [], bench = pl.Sub || [], byId = {};
    start.concat(bench).forEach(function (p) { if (p && p.playerID) byId[p.playerID] = p; });
    var gks = start.filter(function (p) { return p && p.playerPosition === 'Goalkeeper'; });
    if (gks.length !== 1) return null;
    var cur = gks[0].playerID;
    var subs = (((team.events || {}).subs) || []).slice().sort(function (a, b) {
      return (+a.eventTime || 0) - (+b.eventTime || 0);
    });
    subs.forEach(function (s) {
      var e = s && s.substitutionEvents;
      if (e && e.subOffID === cur && +s.eventTime < minute && byId[e.subOnID]) cur = e.subOnID;
    });
    return { id: cur, name: SOTM.playerName(byId[cur]) };
  };

  /* Every goalkeeper who played for the club in the match, in the order
     they came on: { id, name }. Starters listed as Goalkeeper, then anyone
     who came on as one — by their bench position, or because they replaced
     a keeper (a sub's own playerPosition is always "Substitute"). This is
     the keeper dropdown; keeperAt picks its default. */
  SOTM.keepersInMatch = function (team) {
    var pl = (team && team.players) || {}, byId = {}, out = [], seen = {};
    var start = pl.Start || [], bench = pl.Sub || [];
    start.concat(bench).forEach(function (p) { if (p && p.playerID) byId[p.playerID] = p; });
    function add(id) {
      if (!id || seen[id] || !byId[id]) return;
      seen[id] = 1;
      out.push({ id: id, name: SOTM.playerName(byId[id]) });
    }
    start.forEach(function (p) { if (p && p.playerPosition === 'Goalkeeper') add(p.playerID); });
    var subs = (((team && team.events) || {}).subs || []).slice().sort(function (a, b) {
      return (+a.eventTime || 0) - (+b.eventTime || 0);
    });
    subs.forEach(function (s) {
      var e = s && s.substitutionEvents, on = e && byId[e.subOnID];
      if (!on) return;
      if (on.playerSubPosition === 'Goalkeeper' || seen[e.subOffID]) add(e.subOnID);
    });
    return out;
  };

  /* A nomination's clips as a list, oldest first. Records from before
     v14.0 carry one `clip`; later ones a `clips` map. */
  SOTM.clipsOf = function (rec) {
    if (!rec) return [];
    var out = [];
    if (rec.clip) out.push(Object.assign({ key: 'clip' }, rec.clip));
    Object.keys(rec.clips || {}).sort().forEach(function (k) {
      out.push(Object.assign({ key: k }, rec.clips[k]));
    });
    return out;
  };

  /* Every name in the club's squad for the match, for the override box. */
  SOTM.squadNames = function (team) {
    var pl = (team && team.players) || {}, seen = {}, out = [];
    (pl.Start || []).concat(pl.Sub || []).forEach(function (p) {
      var n = SOTM.playerName(p);
      if (n && !seen[n]) { seen[n] = 1; out.push(n); }
    });
    return out.sort();
  };

  /* The content type to upload a clip as, or null if it is not a video.
     Not file.type alone: some browsers send an empty type for .mov, and the
     Storage rule refuses anything that is not video/*. */
  var VIDEO_EXT = { mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime',
    webm: 'video/webm', avi: 'video/x-msvideo', mkv: 'video/x-matroska' };
  SOTM.clipType = function (name, type) {
    if (/^video\//.test(String(type || ''))) return type;
    var ext = (String(name || '').match(/\.([A-Za-z0-9]+)$/) || [])[1];
    return (ext && VIDEO_EXT[ext.toLowerCase()]) || null;
  };

  /* A file name safe for a Storage path. */
  SOTM.safeName = function (name) {
    return String(name || 'clip').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80);
  };

  root.SOTM = SOTM;
})(typeof window !== 'undefined' ? window : globalThis);
