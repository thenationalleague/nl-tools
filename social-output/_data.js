/* =========================================================================
   Social Output — data logic
   File: /social-output/_data.js
   Version: v1.1 (16/10/2026)

   Everything the page does to the numbers, with no DOM and no Firebase, so it
   can be tested in Node (tests/social-output.test.mjs). index.html loads this
   and owns the reading, writing and drawing.

   Exposes window.SocialData:
     CHANNELS, KINDS, METRIC_KEYS, PLANNER_TYPES, DEFAULT_RULES
     parseNumber(v)              '1.2K' / '3,400' / '' -> number | null
     toLondon(iso)               ISO UTC -> 'YYYY-MM-DD HH:mm' Europe/London
     londonToIso(str)            'YYYY-MM-DD HH:mm' London -> ISO UTC
     normaliseX(rows)            CSV objects -> { posts, skipped, columns }
     postKey(post)               channel id, 'rt_' prefix on reposts
     categorise(post, rules)     -> { category, plannerType }
     planImport(posts, existing, opts)  -> { stats, updates, skipped }
     planRerun(existing, rules)  -> { count, updates }
     summarise(posts)            own / reshares / views / median
     topOwn(posts, n)
     dailyCounts(posts, month)
     matchdayProfile(posts, month, opts)
     changeLine(label, cur, prev)
     monthsFrom(start, end), prevMonth(m), monthLabel(m)

   Changelog
     v1.1 (16/10/2026) — Import flags without blocking: overspill (rows from
                         other months, rejected and counted per month),
                         reshares of older posts carried into the month,
                         and gaps (empty days, days with no own post). A
                         reshare dated in a month the file also has own
                         posts for is rejected rather than carried, so a
                         multi-month export cannot count reshares twice.
     v1.0 (16/10/2026) — First build. X scraper CSV mapper (header aliases,
                         not fixed column names), re-import merge that only
                         touches metrics and non-manual categories, ordered
                         keyword rules, cadence and matchday maths.
   ========================================================================= */
(function (root) {
  'use strict';

  var CHANNELS = [
    { key: 'x',         label: 'X',         phase: 1, route: 'Scraper CSV' },
    { key: 'instagram', label: 'Instagram', phase: 2, route: 'Meta Graph API' },
    { key: 'facebook',  label: 'Facebook',  phase: 2, route: 'Meta Graph API' },
    { key: 'youtube',   label: 'YouTube',   phase: 3, route: 'YouTube Data API' },
    { key: 'tiktok',    label: 'TikTok',    phase: 4, route: 'Analytics export' },
    { key: 'linkedin',  label: 'LinkedIn',  phase: 4, route: 'Analytics export' }
  ];

  var KINDS = ['original', 'reply', 'quote', 'repost', 'reel', 'story', 'short', 'video'];
  var PLANNER_TYPES = ['routine', 'reactive', 'original'];
  /* quotes is X-only and not in the spec's list; kept as its own number
     rather than folded into shares, which would make X's shares mean
     something different from every other channel's. */
  var METRIC_KEYS = ['views', 'likes', 'comments', 'shares', 'saves', 'reposts', 'quotes', 'bookmarks'];

  /* Starting rules for X. First match wins, so order matters: TOTW before the
     generic "own image" rule, HT/FT before the reshare catch-all. Admins edit
     these on the Categories tab; once saved there, these defaults are not
     used for that channel. Keyword matching is whole-word, so 'ht' does not
     match 'that'. */
  var DEFAULT_RULES = {
    x: [
      { category: 'TOTW',           plannerType: 'routine',  scope: 'any',     keywords: ['team of the week', 'totw'] },
      { category: 'HT graphic',     plannerType: 'routine',  scope: 'reshare', keywords: ['half-time', 'half time', 'halftime', 'ht'] },
      { category: 'FT graphic',     plannerType: 'routine',  scope: 'reshare', keywords: ['full-time', 'full time', 'fulltime', 'ft', 'final score'] },
      { category: 'DAZN clip',      plannerType: 'reactive', scope: 'any',     keywords: ['dazn'], media: ['video'] },
      { category: 'Website share',  plannerType: 'routine',  scope: 'own',     domains: ['thenationalleague.org.uk'] },
      { category: 'Routine graphic', plannerType: 'routine', scope: 'own',     media: ['image', 'images'] },
      { category: 'Reactive',       plannerType: 'reactive', scope: 'own' },
      { category: 'Other reshare',  plannerType: 'reactive', scope: 'reshare' }
    ]
  };

  /* ── Small helpers ─────────────────────────────────────────────────── */

  function str(v) { return v == null ? '' : String(v).trim(); }
  function normHead(h) { return str(h).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function parseNumber(v) {
    var s = str(v).replace(/,/g, '').toUpperCase();
    if (!s) return null;
    var m = s.match(/^(-?\d+(?:\.\d+)?)\s*([KMB])?$/);
    if (!m) return null;
    var n = parseFloat(m[1]);
    if (m[2] === 'K') n *= 1e3;
    else if (m[2] === 'M') n *= 1e6;
    else if (m[2] === 'B') n *= 1e9;
    return Math.round(n);
  }

  function parseBool(v) {
    var s = str(v).toLowerCase();
    if (!s) return null;
    if (s === 'true' || s === 'yes' || s === 'y' || s === '1') return true;
    if (s === 'false' || s === 'no' || s === 'n' || s === '0') return false;
    return null;
  }

  /* Europe/London wall-clock for a UTC instant. Intl does the BST maths, so
     the clocks-change weekends land on the right side. */
  var _ldnFmt = null;
  function londonParts(date) {
    if (!_ldnFmt) {
      _ldnFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/London', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    }
    var o = {};
    _ldnFmt.formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function toLondon(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = londonParts(d);
    return p.year + '-' + p.month + '-' + p.day + ' ' + p.hour + ':' + p.minute;
  }
  /* London wall-clock -> ISO UTC. Guess UTC, read back what London shows,
     correct by the difference. One correction is enough because the offset
     is at most an hour and only changes twice a year. */
  function londonToIso(s) {
    var m = str(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) return '';
    var want = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var guess = new Date(want);
    var p = londonParts(guess);
    var shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return new Date(want - (shown - want)).toISOString();
  }

  /* Accepts ISO with a zone (what a scraper reading <time datetime> gives),
     epoch ms/seconds, and zone-less 'YYYY-MM-DD HH:mm' or 'DD/MM/YYYY HH:mm',
     which are read as London time. Returns ISO UTC or ''. */
  function parseWhen(v) {
    var s = str(v);
    if (!s) return '';
    if (/^\d{10}$/.test(s)) return new Date(+s * 1000).toISOString();
    if (/^\d{13}$/.test(s)) return new Date(+s).toISOString();
    if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
      var d = new Date(s);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    var uk = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,T]+(\d{1,2}):(\d{2})/);
    if (uk) return londonToIso(uk[3] + '-' + pad(+uk[2]) + '-' + pad(+uk[1]) + ' ' + pad(+uk[4]) + ':' + uk[5]);
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) return londonToIso(s);
    return '';
  }

  function domainOf(url) {
    var m = str(url).match(/^https?:\/\/([^\/?#]+)/i);
    return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
  }

  /* RTDB keys cannot hold . # $ [ ] or /. Channel IDs are digits for X, but
     an export from another channel can carry a URN with colons — fine — or
     a slash, which is not. */
  function safeKey(s) { return str(s).replace(/[.#$\[\]\/]/g, '_'); }

  function postKey(post) {
    var id = safeKey(post.id);
    return (post.kind === 'repost' ? 'rt_' : '') + id;
  }

  function clean(obj) {
    var out = {};
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v === undefined || v === null || v === '') return;
      if (typeof v === 'object' && !Array.isArray(v)) {
        v = clean(v);
        if (!Object.keys(v).length) return;
      }
      out[k] = v;
    });
    return out;
  }

  /* ── X scraper CSV ─────────────────────────────────────────────────── */

  /* The scraper's own column names are matched by alias, not assumed: a
     header is lower-cased and stripped to letters and digits, then looked up
     here. Anything unmatched is reported on the Import preview so a renamed
     column shows up as "not read" instead of silently becoming blank. */
  var X_ALIASES = {
    key:          ['key', 'postkey'],
    id:           ['id', 'tweetid', 'postid', 'statusid'],
    channel:      ['channel', 'platform'],
    url:          ['url', 'link', 'tweeturl', 'posturl', 'permalink'],
    postedAt:     ['postedat', 'datetime', 'timestamp', 'time', 'date', 'createdat', 'posted', 'isotime', 'postedutc'],
    postedAtLocal:['postedatlocal', 'localtime', 'timelocal', 'londontime'],
    kind:         ['kind', 'type', 'posttype', 'tweettype'],
    isRepost:     ['isrepost', 'repost', 'isretweet', 'retweet', 'reshare', 'isreshare'],
    isOwn:        ['isown', 'own'],
    author:       ['author', 'handle', 'username', 'user', 'screenname', 'authorhandle', 'originalauthor'],
    text:         ['text', 'content', 'tweettext', 'body', 'caption'],
    linkUrl:      ['linkurl', 'externallink', 'cardurl', 'outboundlink', 'expandedurl', 'outboundurl'],
    linkDomain:   ['linkdomain', 'domain'],
    media:        ['media', 'mediatype'],
    mediaCount:   ['mediacount', 'nummedia', 'mediaitems'],
    thumbUrl:     ['thumburl', 'thumbnail', 'thumb', 'imageurl', 'poster', 'posterurl'],
    timeIsOriginal: ['timeisoriginal'],
    category:     ['category'],
    views:        ['views', 'viewcount', 'impressions'],
    likes:        ['likes', 'likecount', 'favourites', 'favorites'],
    comments:     ['comments', 'replies', 'replycount', 'commentcount'],
    reposts:      ['reposts', 'retweets', 'repostcount', 'retweetcount'],
    quotes:       ['quotes', 'quotecount'],
    bookmarks:    ['bookmarks', 'bookmarkcount'],
    shares:       ['shares', 'sharecount'],
    saves:        ['saves', 'savecount']
  };

  function mapColumns(headers, aliases) {
    var lookup = {};
    Object.keys(aliases).forEach(function (field) {
      aliases[field].forEach(function (a) { if (!(a in lookup)) lookup[a] = field; });
    });
    var map = {}, recognised = [], unrecognised = [];
    headers.forEach(function (h) {
      var f = lookup[normHead(h)];
      if (f && !map[f]) { map[f] = h; recognised.push(h + ' → ' + f); }
      else unrecognised.push(h);
    });
    return { map: map, recognised: recognised, unrecognised: unrecognised };
  }

  function normKind(raw, isRepost) {
    var s = str(raw).toLowerCase();
    if (isRepost === true || /repost|retweet|reshare/.test(s)) return 'repost';
    if (/repl/.test(s)) return 'reply';
    if (/quote/.test(s)) return 'quote';
    if (KINDS.indexOf(s) >= 0) return s;
    return 'original';
  }

  function normMedia(raw, count) {
    var s = str(raw).toLowerCase();
    var n = count == null ? null : count;
    if (!s || s === 'none' || s === '0') return n ? (n > 1 ? 'images' : 'image') : 'none';
    if (/gif/.test(s)) return 'gif';
    if (/video|clip/.test(s)) return 'video';
    if (/carousel/.test(s)) return 'carousel';
    if (/images|photos/.test(s)) return 'images';
    if (/image|photo|picture/.test(s)) return n && n > 1 ? 'images' : 'image';
    return 'none';
  }

  /* rows: objects from NL.csvParse(text, {header:true}). */
  function normaliseX(rows) {
    rows = rows || [];
    var headers = rows.length ? Object.keys(rows[0]) : [];
    var cols = mapColumns(headers, X_ALIASES);
    var M = cols.map;
    var missing = [];
    if (!M.id && !M.key && !M.url) missing.push('a post ID or URL');
    if (!M.postedAt && !M.postedAtLocal) missing.push('a post time');

    var posts = [], skipped = [];
    if (missing.length) return { posts: posts, skipped: skipped, columns: cols, missing: missing };

    rows.forEach(function (r, i) {
      function g(f) { return M[f] ? r[M[f]] : ''; }
      var line = i + 2; /* +1 header, +1 to count from 1 */
      var rawKey = str(g('key'));
      var id = str(g('id'));
      var url = str(g('url'));
      var ch = str(g('channel')).toLowerCase();
      if (ch && ch !== 'x' && ch !== 'twitter') { skipped.push({ line: line, reason: 'Channel is "' + ch + '", not X' }); return; }

      var repostFlag = parseBool(g('isRepost'));
      if (/^rt_/.test(rawKey)) repostFlag = true;
      if (!id && rawKey) id = rawKey.replace(/^rt_/, '');
      if (!id && url) { var um = url.match(/\/status(?:es)?\/(\d+)/); if (um) id = um[1]; }
      id = id.replace(/^rt_/, '');
      if (!id) { skipped.push({ line: line, reason: 'No post ID' }); return; }

      var own = parseBool(g('isOwn'));
      if (own === false && repostFlag == null) repostFlag = true;
      var kind = normKind(g('kind'), repostFlag);

      var iso = parseWhen(g('postedAt'));
      if (!iso && M.postedAtLocal) iso = londonToIso(g('postedAtLocal'));
      if (!iso) { skipped.push({ line: line, reason: 'Time not readable: "' + str(g('postedAt') || g('postedAtLocal')) + '"' }); return; }

      var mediaCount = parseNumber(g('mediaCount'));
      var linkUrl = str(g('linkUrl'));
      var metrics = {};
      METRIC_KEYS.forEach(function (k) { var n = parseNumber(g(k)); if (n != null) metrics[k] = n; });

      var tio = parseBool(g('timeIsOriginal'));
      posts.push(clean({
        channel: 'x',
        id: id,
        url: url || ('https://x.com/i/status/' + id),
        postedAt: iso,
        postedAtLocal: toLondon(iso),
        kind: kind,
        isOwn: kind !== 'repost',
        author: str(g('author')).replace(/^@/, ''),
        text: str(g('text')),
        linkUrl: linkUrl,
        linkDomain: str(g('linkDomain')).toLowerCase().replace(/^www\./, '') || domainOf(linkUrl),
        media: normMedia(g('media'), mediaCount),
        mediaCount: mediaCount,
        thumbUrl: str(g('thumbUrl')),
        metrics: metrics,
        /* X shows the original post's time on a repost, not when the league
           reposted it — the scraper cannot see the reshare time. */
        timeIsOriginal: tio != null ? tio : kind === 'repost',
        csvCategory: str(g('category')),
        source: 'scraper'
      }));
    });
    return { posts: posts, skipped: skipped, columns: cols, missing: missing };
  }

  /* ── Categories ────────────────────────────────────────────────────── */

  function listOf(v) {
    if (Array.isArray(v)) return v.map(str).filter(Boolean);
    return str(v).split(',').map(str).filter(Boolean);
  }
  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* Whole-word, case-insensitive. A boundary is only added where the keyword
     itself starts/ends with a letter or digit, so '#totw' and 'ht:' still
     work. */
  function hasKeyword(text, kw) {
    kw = kw.toLowerCase();
    var pre = /^[a-z0-9]/.test(kw) ? '(^|[^a-z0-9])' : '';
    var post = /[a-z0-9]$/.test(kw) ? '($|[^a-z0-9])' : '';
    return new RegExp(pre + escRe(kw) + post).test(text);
  }

  /* A rule is a set of conditions. Every condition it states must hold (AND);
     inside a condition any listed value will do (OR). A rule with no
     conditions beyond its scope is a catch-all. */
  function ruleMatches(rule, post) {
    var scope = rule.scope || 'any';
    if (scope === 'own' && !post.isOwn) return false;
    if (scope === 'reshare' && post.isOwn) return false;
    var kinds = listOf(rule.kinds);
    if (kinds.length && kinds.indexOf(post.kind) < 0) return false;
    var media = listOf(rule.media);
    if (media.length && media.indexOf(post.media || 'none') < 0) return false;
    var domains = listOf(rule.domains);
    if (domains.length) {
      var d = (post.linkDomain || '').toLowerCase();
      var hit = domains.some(function (x) { x = x.toLowerCase(); return d === x || d.slice(-(x.length + 1)) === '.' + x; });
      if (!hit) return false;
    }
    var kws = listOf(rule.keywords);
    if (kws.length) {
      var t = (post.text || '').toLowerCase();
      if (!kws.some(function (k) { return hasKeyword(t, k); })) return false;
    }
    return true;
  }

  function categorise(post, rules) {
    rules = rules || [];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i] && rules[i].category && ruleMatches(rules[i], post)) {
        return { category: rules[i].category, plannerType: rules[i].plannerType || '' };
      }
    }
    if (post.csvCategory) return { category: post.csvCategory, plannerType: '' };
    return { category: 'Uncategorised', plannerType: '' };
  }

  /* ── Import planning ───────────────────────────────────────────────── */

  function monthOf(post) { return (post.postedAtLocal || '').slice(0, 7); }

  function sameMetrics(a, b) {
    a = a || {}; b = b || {};
    var keys = {};
    Object.keys(a).forEach(function (k) { keys[k] = 1; });
    Object.keys(b).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).every(function (k) { return a[k] === b[k]; });
  }

  /* posts:    normalised posts from one file
     existing: { postKey: record } already stored for that channel + month
     opts:     { month: 'YYYY-MM', rules: [...], now: ISO }
     Returns a multi-path update relative to posts/{channel}/{month}, plus
     what the preview flags without blocking: overspill (rows from other
     months, rejected and counted by month), carried (reshares of older
     posts kept in this month) and gaps (days with nothing, days with no
     own post).

     A post already stored keeps everything it has — text, time, kind, a
     person's category — and only its numbers move. That is what makes a
     second import of the same file a no-op apart from fresher metrics. */
  function planImport(posts, existing, opts) {
    existing = existing || {};
    var month = opts.month, rules = opts.rules || [], now = opts.now || new Date().toISOString();
    var stats = { read: posts.length, created: 0, updated: 0, unchanged: 0, skipped: 0, outside: 0, duplicate: 0, carried: 0 };
    var skipped = [];
    var updates = {};
    var seen = {};
    var overspill = {};

    /* Months the file holds own posts for. A reshare dated in one of those
       months belongs to that month's import, not this one. */
    var ownMonths = {};
    posts.forEach(function (p) { if (p.kind !== 'repost') ownMonths[monthOf(p)] = true; });

    posts.forEach(function (p) {
      var key = postKey(p);
      var pm = monthOf(p);
      /* A repost carries the original's time, which can fall in an earlier
         month even though the league reshared it in this one, so it is kept
         here. The exception is a file that also holds own posts for that
         earlier month: then it is a multi-month export, the reshare is that
         month's, and keeping it here would count it twice. Everything else
         outside the month is rejected. */
      var carried = pm !== month && p.kind === 'repost' && p.timeIsOriginal && pm < month && !ownMonths[pm];
      if (pm !== month && !carried) {
        stats.outside++; stats.skipped++;
        overspill[pm || '?'] = (overspill[pm || '?'] || 0) + 1;
        return;
      }
      if (carried) stats.carried++;
      if (seen[key]) {
        stats.duplicate++; stats.skipped++;
        skipped.push({ key: key, reason: 'Appears twice in the file; last row kept' });
      }
      seen[key] = p;
    });

    Object.keys(seen).forEach(function (key) {
      var p = seen[key];
      var cat = categorise(p, rules);
      var old = existing[key];
      if (!old) {
        var rec = {};
        Object.keys(p).forEach(function (k) { if (k !== 'csvCategory') rec[k] = p[k]; });
        rec.isOwn = p.kind !== 'repost';
        rec.category = cat.category;
        rec.plannerType = cat.plannerType;
        rec.categoryManual = false;
        rec.metricsAt = now;
        /* clean() drops blanks, never false, so isOwn and categoryManual
           survive it. */
        updates[key] = clean(rec);
        stats.created++;
        return;
      }
      var changed = false;
      if (p.metrics && Object.keys(p.metrics).length && !sameMetrics(p.metrics, old.metrics)) {
        updates[key + '/metrics'] = p.metrics;
        updates[key + '/metricsAt'] = now;
        changed = true;
      }
      if (p.thumbUrl && p.thumbUrl !== old.thumbUrl) {
        updates[key + '/thumbUrl'] = p.thumbUrl;
        changed = true;
      }
      if (!old.categoryManual && (old.category !== cat.category || (old.plannerType || '') !== cat.plannerType)) {
        updates[key + '/category'] = cat.category;
        updates[key + '/plannerType'] = cat.plannerType;
        changed = true;
      }
      if (changed) stats.updated++; else stats.unchanged++;
    });

    var kept = Object.keys(seen).map(function (k) { return seen[k]; });
    return { stats: stats, updates: updates, skipped: skipped, overspill: overspill, gaps: gaps(kept, month) };
  }

  /* Days of the month the file has nothing for, and days with reshares but
     no own post. Flags for the preview: a scrape that stopped early or
     started late shows up as a run of empty days at one end. */
  function gaps(posts, month) {
    var d = dailyCounts(posts, month);
    var empty = [], noOwn = [];
    d.days.forEach(function (x) {
      if (!x.own && !x.reshare) empty.push(x.date);
      else if (!x.own) noOwn.push(x.date);
    });
    return { empty: empty, noOwn: noOwn };
  }

  /* Re-run the rules over posts already stored. A category a person set is
     never touched. */
  function planRerun(existing, rules) {
    var updates = {}, count = 0;
    Object.keys(existing || {}).forEach(function (key) {
      var p = existing[key];
      if (!p || p.categoryManual) return;
      var cat = categorise(p, rules);
      if (p.category !== cat.category || (p.plannerType || '') !== cat.plannerType) {
        updates[key + '/category'] = cat.category;
        updates[key + '/plannerType'] = cat.plannerType;
        count++;
      }
    });
    return { count: count, updates: updates };
  }

  /* ── Summaries ─────────────────────────────────────────────────────── */

  function asList(posts) {
    if (Array.isArray(posts)) return posts;
    return Object.keys(posts || {}).map(function (k) { var p = posts[k]; p._key = k; return p; });
  }

  function median(nums) {
    if (!nums.length) return null;
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  }

  /* Views are only ever summed over own posts. On a reshare the numbers are
     the original account's, and adding them in would report another club's
     reach as the league's. */
  function summarise(posts) {
    var list = asList(posts);
    var own = list.filter(function (p) { return p.isOwn; });
    var views = own.map(function (p) { return p.metrics && p.metrics.views; })
                   .filter(function (v) { return typeof v === 'number'; });
    return {
      total: list.length,
      own: own.length,
      reshares: list.length - own.length,
      ownViews: views.reduce(function (a, b) { return a + b; }, 0),
      ownWithViews: views.length,
      medianViews: median(views)
    };
  }

  function topOwn(posts, n) {
    return asList(posts)
      .filter(function (p) { return p.isOwn && p.metrics && typeof p.metrics.views === 'number'; })
      .sort(function (a, b) { return b.metrics.views - a.metrics.views; })
      .slice(0, n || 5);
  }

  function daysIn(month) {
    var y = +month.slice(0, 4), m = +month.slice(5, 7);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  /* One entry per day of the month. Reposts filed here but dated earlier
     (their time is the original's) cannot be placed on a day, so they are
     counted apart rather than piled onto the 1st. */
  function dailyCounts(posts, month) {
    var n = daysIn(month), days = [];
    for (var d = 1; d <= n; d++) {
      var date = month + '-' + pad(d);
      var dow = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1, d)).getUTCDay();
      days.push({ date: date, day: d, dow: dow, own: 0, reshare: 0 });
    }
    var undated = 0;
    asList(posts).forEach(function (p) {
      var local = p.postedAtLocal || '';
      if (local.slice(0, 7) !== month) { undated++; return; }
      var row = days[+local.slice(8, 10) - 1];
      if (!row) { undated++; return; }
      if (p.isOwn) row.own++; else row.reshare++;
    });
    return { days: days, undated: undated };
  }

  /* 15-minute profile of matchdays. A matchday is a day carrying at least one
     post in a matchday category (HT/FT graphics by default) — read from the
     posts rather than a fixture list, so it reflects what the channel did.
     Saturdays and other days are kept apart. */
  function matchdayProfile(posts, month, opts) {
    opts = opts || {};
    var cats = opts.matchdayCategories || ['HT graphic', 'FT graphic'];
    var list = asList(posts).filter(function (p) { return (p.postedAtLocal || '').slice(0, 7) === month; });
    var mdays = {};
    list.forEach(function (p) {
      if (cats.indexOf(p.category) >= 0) mdays[p.postedAtLocal.slice(0, 10)] = true;
    });
    function blank() { var a = []; for (var i = 0; i < 96; i++) a.push(0); return a; }
    var out = {
      sat: { days: [], own: blank(), reshare: blank() },
      mid: { days: [], own: blank(), reshare: blank() }
    };
    Object.keys(mdays).sort().forEach(function (date) {
      var dow = new Date(date + 'T12:00:00Z').getUTCDay();
      (dow === 6 ? out.sat : out.mid).days.push(date);
    });
    list.forEach(function (p) {
      var date = p.postedAtLocal.slice(0, 10);
      if (!mdays[date]) return;
      var dow = new Date(date + 'T12:00:00Z').getUTCDay();
      var slot = (+p.postedAtLocal.slice(11, 13)) * 4 + Math.floor(+p.postedAtLocal.slice(14, 16) / 15);
      var g = dow === 6 ? out.sat : out.mid;
      (p.isOwn ? g.own : g.reshare)[slot]++;
    });
    return out;
  }

  function pct(cur, prev) {
    if (prev == null || cur == null) return null;
    if (prev === 0) return cur === 0 ? 0 : null;
    return Math.round((cur - prev) / prev * 100);
  }

  function fmt(n) { return n == null ? '–' : Number(n).toLocaleString('en-GB'); }

  /* One sentence on what moved for a channel, for the board pack. */
  function changeLine(label, cur, prev) {
    if (!cur || !cur.total) return label + ': nothing imported for this month.';
    if (!prev || !prev.total) return label + ': ' + fmt(cur.own) + ' own posts and ' + fmt(cur.reshares) + ' reshares. No figures for the month before to compare.';
    var parts = [];
    var po = pct(cur.own, prev.own);
    parts.push('own posts ' + (po == null ? 'n/a' : po === 0 ? 'level' : (po > 0 ? 'up ' : 'down ') + Math.abs(po) + '%') +
               ' (' + fmt(prev.own) + ' → ' + fmt(cur.own) + ')');
    var pm = pct(cur.medianViews, prev.medianViews);
    if (pm != null) parts.push('median views ' + (pm === 0 ? 'level' : (pm > 0 ? 'up ' : 'down ') + Math.abs(pm) + '%') +
               ' (' + fmt(prev.medianViews) + ' → ' + fmt(cur.medianViews) + ')');
    var pr = pct(cur.reshares, prev.reshares);
    if (pr != null) parts.push('reshares ' + (pr === 0 ? 'level' : (pr > 0 ? 'up ' : 'down ') + Math.abs(pr) + '%'));
    var s = parts.join('; ');
    return label + ': ' + s.charAt(0).toUpperCase() + s.slice(1) + '.';
  }

  /* ── Months ────────────────────────────────────────────────────────── */

  function prevMonth(m) {
    var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1;
    if (mo === 0) { y--; mo = 12; }
    return y + '-' + pad(mo);
  }
  function monthsFrom(start, end) {
    var out = [], m = end;
    while (m >= start) { out.push(m); m = prevMonth(m); }
    return out;
  }
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                     'August', 'September', 'October', 'November', 'December'];
  function monthLabel(m) { return MONTH_NAMES[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4); }
  function currentMonth(now) { return toLondon((now || new Date()).toISOString()).slice(0, 7); }

  root.SocialData = {
    CHANNELS: CHANNELS, KINDS: KINDS, METRIC_KEYS: METRIC_KEYS,
    PLANNER_TYPES: PLANNER_TYPES, DEFAULT_RULES: DEFAULT_RULES,
    parseNumber: parseNumber, parseWhen: parseWhen,
    toLondon: toLondon, londonToIso: londonToIso,
    normaliseX: normaliseX, postKey: postKey, safeKey: safeKey,
    ruleMatches: ruleMatches, categorise: categorise, listOf: listOf,
    planImport: planImport, planRerun: planRerun, gaps: gaps,
    summarise: summarise, topOwn: topOwn, median: median,
    dailyCounts: dailyCounts, matchdayProfile: matchdayProfile,
    changeLine: changeLine, pct: pct,
    prevMonth: prevMonth, monthsFrom: monthsFrom, monthLabel: monthLabel,
    currentMonth: currentMonth, daysIn: daysIn
  };
})(typeof window !== 'undefined' ? window : this);
