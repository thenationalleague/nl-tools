/* =======================================================================
   NL Fixtures — Opta ID marry-up / seed builder
   Version: 1.0
   Date: 30/07/2026

   Marries the seeded fixture list (assets/data/fixtures-2026-27.json,
   exported before the season started) against the live NLS match feed
   so every fixture carries its immutable Opta match ID.

   WHY THIS EXISTS
     The seed has the fixtures as ORIGINALLY published — no Opta IDs.
     NLS has the Opta IDs and the CURRENT kickoff dates/times, which have
     moved since the seed was taken. Neither side alone is enough:

       seed  -> the original schedule  (what was first published)
       NLS   -> the Opta ID + where the fixture sits today

     The join therefore CANNOT use the date — that's the field that
     changed. It uses the ordered (home, away) pair, which in a
     double round-robin occurs exactly once per season:
     24 clubs -> 24 x 23 = 552 fixtures, all pairs distinct. Verified
     against the seed before joining; the script aborts if that
     assumption ever breaks (e.g. a division of a different size).

   OUTPUT
     Two files, written next to each other:

     1. <out>/fixture-seed-<season>.json   the merged records
        Each record carries BOTH kickoffs, so the divergence is data,
        not a lost edit:
          matchID          Opta ID from NLS — the immutable primary key
          original         { date, kickoff, kickoffUTC }  from the seed
          current          { date, kickoff, kickoffUTC }  from NLS
          rescheduled      true when the two differ
          homeTeam/awayTeam { name, optaID, nlsTeamID }
          venue, matchPeriod, homeScore, awayScore   from NLS
          dazn             from the seed

     2. <out>/fixture-seed-<season>.report.json   the reconciliation
        Counts, every rescheduled fixture with from/to, and both
        unmatched lists. Read this before importing anything.

   USAGE
     # direct fetch (needs egress to nationalleagueservices.co.uk)
     node scripts/build-fixture-seed.js --fetch

     # offline: fetch the payload elsewhere, then feed it in
     node scripts/build-fixture-seed.js --nls path/to/nls-89-2026.json

   OPTIONS
     --fetch              pull from the NLS API directly
     --nls <file>         read a saved NLS payload instead (raw response,
                          an array of pages, or a bare data array)
     --competition <id>   NLS competition ID          (default 89)
     --season <id>        NLS season ID               (default 2026)
     --division <name>    seed division to join       (default National)
     --seed <file>        seed fixtures file
     --out <dir>          output directory            (default build/)
     --expect <n>         expected fixture count; non-zero exit on mismatch

   COMPETITION IDS   89 National · 373 North · 372 South · 1275 NL Cup

   NOTE ON WRITING TO THE REPO
     Default output is build/ (git-ignored) — this produces a data file
     and, per the repo's data-handling rules, generated data does not get
     committed. It is an import payload for RTDB, not a repo asset.
   ======================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

const NLS_BASE = 'https://multi-club-matches.football.web.gc.nationalleagueservices.co.uk/v2';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const SLEEP_PAGE_MS = 2000;
const RETRY_WAIT_MS = 30000;

/* ---- CLI ------------------------------------------------------------- */

function parseArgs(argv) {
  const opts = {
    fetch: false,
    nls: null,
    competition: '89',
    season: '2026',
    division: 'National',
    seed: path.join(REPO_ROOT, 'assets/data/fixtures-2026-27.json'),
    out: path.join(REPO_ROOT, 'build'),
    expect: null
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--fetch') opts.fetch = true;
    else if (a === '--nls') opts.nls = next();
    else if (a === '--competition') opts.competition = next();
    else if (a === '--season') opts.season = next();
    else if (a === '--division') opts.division = next();
    else if (a === '--seed') opts.seed = next();
    else if (a === '--out') opts.out = next();
    else if (a === '--expect') opts.expect = parseInt(next(), 10);
    else if (a === '--help' || a === '-h') { printUsage(); process.exit(0); }
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!opts.fetch && !opts.nls) {
    throw new Error('Need either --fetch or --nls <file>. See --help.');
  }
  return opts;
}

function printUsage() {
  console.log(`
  build-fixture-seed — marry seeded fixtures to Opta match IDs from NLS

    node scripts/build-fixture-seed.js --fetch
    node scripts/build-fixture-seed.js --nls nls-89-2026.json

  --fetch | --nls <file>   where the NLS payload comes from (one required)
  --competition <id>       89 National (default) · 373 North · 372 South · 1275 Cup
  --season <id>            default 2026
  --division <name>        seed division to join, default National
  --seed <file>            default assets/data/fixtures-2026-27.json
  --out <dir>              default build/
  --expect <n>             fail the run if the matched count isn't n
`);
}

/* ---- Team resolution -------------------------------------------------- */

/* Normalise a club name for fuzzy comparison. NLS and the seed don't
   always agree on "FC"/"AFC"/"United" placement or punctuation, so names
   are only ever a FALLBACK — the Opta ID is the real identity. */
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\b(fc|afc|club)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* clubs-meta stores clubs as an ARRAY, so the container index is not a
   stable identity — re-sorting the file would silently repoint every key.
   The club's `code` (FYL, ALD, ...) is unique and stable, so that is what
   travels into the fixture records as clubKey. */
function buildClubIndex(meta) {
  const idx = { byOpta: new Map(), byNorm: new Map(), all: [] };
  for (const club of Object.values(meta.clubs || {})) {
    if (!club || !club.name) continue;
    const key = club.code || club.optaID || club.name;
    const entry = { key, name: club.name, optaID: club.optaID || null, short: club.short, code: club.code };
    idx.all.push(entry);
    if (entry.optaID) idx.byOpta.set(String(entry.optaID), entry);
    for (const alias of [club.name, club.short, club.code]) {
      const n = normName(alias);
      if (n && !idx.byNorm.has(n)) idx.byNorm.set(n, entry);
    }
  }
  return idx;
}

/* NLS team -> clubs-meta entry. Opta ID first (authoritative), then name. */
function resolveTeam(idx, nlsTeam) {
  if (!nlsTeam) return null;
  const id = nlsTeam.teamID != null ? String(nlsTeam.teamID) : null;
  if (id && idx.byOpta.has(id)) return idx.byOpta.get(id);
  for (const alias of [nlsTeam.name, nlsTeam.shortName, nlsTeam.initials]) {
    const n = normName(alias);
    if (n && idx.byNorm.has(n)) return idx.byNorm.get(n);
  }
  return null;
}

function resolveSeedName(idx, name) {
  const n = normName(name);
  return idx.byNorm.get(n) || null;
}

/* ---- Seed parsing ----------------------------------------------------- */

/* Seed rows are positional: [date, division, home, away, kickoff, dazn]
   with date as DD/MM/YYYY and kickoff as HH:MM local time. */
function parseSeed(seedDoc, division) {
  const format = seedDoc.format || ['date', 'division', 'home', 'away', 'kickoff', 'dazn'];
  const col = {};
  format.forEach((name, i) => { col[name] = i; });

  const rows = (seedDoc.fixtures || []).filter(r => r[col.division] === division);
  return rows.map((r, i) => ({
    seedIndex: i,
    date: r[col.date],
    division: r[col.division],
    home: r[col.home],
    away: r[col.away],
    kickoff: r[col.kickoff],
    dazn: r[col.dazn] === 1 || r[col.dazn] === true,
    kickoffUTC: seedDateToUTC(r[col.date], r[col.kickoff])
  }));
}

/* DD/MM/YYYY + HH:MM (UK local) -> ISO UTC string.
   Uses the UK DST rule directly (last Sunday in March 01:00 UTC to last
   Sunday in October 01:00 UTC) rather than pulling in a tz library — the
   seed only ever carries UK local kickoffs. */
function seedDateToUTC(dateStr, kickoffStr) {
  const dm = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(dateStr || '').trim());
  if (!dm) return null;
  const [, dd, mm, yyyy] = dm;
  const km = /^(\d{1,2}):(\d{2})$/.exec(String(kickoffStr || '').trim());
  const hh = km ? parseInt(km[1], 10) : 15;
  const mi = km ? parseInt(km[2], 10) : 0;

  const naive = Date.UTC(+yyyy, +mm - 1, +dd, hh, mi, 0);
  return new Date(naive - (ukOffsetMs(naive) || 0)).toISOString();
}

function lastSundayUTC(year, monthIndex, hourUTC) {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));       /* last day of month */
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());                 /* back to Sunday    */
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d.getTime();
}

/* +1h during British Summer Time, 0 otherwise. */
function ukOffsetMs(tsUTC) {
  const year = new Date(tsUTC).getUTCFullYear();
  const start = lastSundayUTC(year, 2, 1);    /* last Sun March, 01:00 UTC   */
  const end = lastSundayUTC(year, 9, 1);      /* last Sun October, 01:00 UTC */
  return (tsUTC >= start && tsUTC < end) ? 3600000 : 0;
}

/* NLS returns kickOffDateUTC as "YYYY-MM-DD HH:MM:SS" — a space, no T, no
   Z — despite the value genuinely being UTC. Passing that straight to
   new Date() makes the runtime parse it as LOCAL time, so the same file
   would import correctly on a UTC box and an hour out on a London laptop
   in summer. Always normalise before parsing; never hand the raw string
   to the Date constructor. Real ISO strings pass through untouched. */
function nlsKickoffToISO(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    const ts = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    return new Date(ts).toISOString();
  }
  const d = new Date(s);                 /* already carries a T and an offset */
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/* ---- NLS fetch -------------------------------------------------------- */

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    let res, text;
    try {
      res = await fetch(url);
      text = await res.text();
    } catch (err) {
      if (attempt === 1) { await sleep(RETRY_WAIT_MS); continue; }
      throw new Error(`NLS fetch failed: ${err.message}`);
    }
    if (res.status === 200) {
      if (text && text.toLowerCase().includes('quota exceeded')) {
        if (attempt === 1) { await sleep(RETRY_WAIT_MS); continue; }
        throw new Error('NLS rate limit: quota exceeded after retry');
      }
      try { return JSON.parse(text); }
      catch (e) { throw new Error(`NLS returned invalid JSON: ${e.message}`); }
    }
    if ((res.status === 429 || res.status === 503) && attempt === 1) {
      await sleep(RETRY_WAIT_MS);
      continue;
    }
    throw new Error(`NLS fetch failed HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  throw new Error('NLS fetch: unreachable');
}

async function fetchCompetition(competitionID, seasonID) {
  const all = [];
  let url = `${NLS_BASE}/matches/?competitionID=${competitionID}` +
            `&seasonID=${seasonID}&sort=kickOffDateUTC` +
            `&page.number=1&page.size=${PAGE_SIZE}`;
  let pages = 0;
  while (url && pages < MAX_PAGES) {
    process.stderr.write(`  fetching page ${pages + 1}...\n`);
    const json = await fetchWithRetry(url);
    if (json && Array.isArray(json.data)) all.push(...json.data);
    url = (json && json.links && json.links.next) ? json.links.next : null;
    pages++;
    if (url) await sleep(SLEEP_PAGE_MS);
  }
  return all;
}

/* Accepts a raw single response, an array of page responses, or a bare
   data array — whichever shape the payload arrives in. */
function extractMatches(payload) {
  if (Array.isArray(payload)) {
    if (payload.length && payload[0] && payload[0].data) {
      return payload.flatMap(p => p.data || []);
    }
    return payload;
  }
  if (payload && Array.isArray(payload.data)) return payload.data;
  throw new Error('Could not find a match array in the NLS payload');
}

/* ---- Join ------------------------------------------------------------- */

function pairKey(homeKey, awayKey) { return `${homeKey} ${awayKey}`; }

function build(seedFixtures, nlsMatches, clubIdx, opts) {
  /* Assert the join key is safe before relying on it. */
  const seen = new Set();
  const dupes = [];
  for (const f of seedFixtures) {
    const h = resolveSeedName(clubIdx, f.home);
    const a = resolveSeedName(clubIdx, f.away);
    if (!h || !a) continue;
    const k = pairKey(h.key, a.key);
    if (seen.has(k)) dupes.push(`${f.home} v ${f.away}`);
    seen.add(k);
  }
  if (dupes.length) {
    throw new Error(
      'Ordered (home, away) pairs are not unique in the seed, so they cannot ' +
      'be used as the join key. Duplicates: ' + dupes.slice(0, 5).join(', ')
    );
  }

  /* Index the seed by pair. */
  const seedByPair = new Map();
  const unresolvedSeed = [];
  for (const f of seedFixtures) {
    const h = resolveSeedName(clubIdx, f.home);
    const a = resolveSeedName(clubIdx, f.away);
    if (!h || !a) {
      unresolvedSeed.push({ home: f.home, away: f.away, date: f.date,
        reason: !h ? `unknown club "${f.home}"` : `unknown club "${f.away}"` });
      continue;
    }
    seedByPair.set(pairKey(h.key, a.key), { fixture: f, home: h, away: a });
  }

  const merged = [];
  const rescheduled = [];
  const unmatchedNls = [];
  const matchedPairs = new Set();

  /* PASS 1 — bucket NLS matches by pair.
     The ordered pair is unique in the LEAGUE programme, but the feed can
     return more than one match on the same pair: a playoff tie, an
     abandoned game replayed, or a cup fixture if the competition filter
     is widened. Collect candidates first so a second match can never
     silently overwrite the league fixture. */
  const candidates = new Map();
  for (const raw of nlsMatches) {
    const attrs = (raw && raw.attributes) || {};
    const nlsHome = attrs.homeTeam || {};
    const nlsAway = attrs.awayTeam || {};
    const h = resolveTeam(clubIdx, nlsHome);
    const a = resolveTeam(clubIdx, nlsAway);

    if (!h || !a) {
      unmatchedNls.push({
        matchID: raw.id,
        home: nlsHome.name || nlsHome.teamID || null,
        away: nlsAway.name || nlsAway.teamID || null,
        kickoffUTC: nlsKickoffToISO(attrs.kickOffDateUTC),
        reason: 'team not resolvable against clubs-meta'
      });
      continue;
    }

    const key = pairKey(h.key, a.key);
    if (!seedByPair.has(key)) {
      unmatchedNls.push({
        matchID: raw.id,
        home: h.name, away: a.name,
        kickoffUTC: nlsKickoffToISO(attrs.kickOffDateUTC),
        reason: 'no seeded fixture for this pair (new fixture — playoff, replay or extra)'
      });
      continue;
    }
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push({ raw, attrs, nlsHome, nlsAway, h, a });
  }

  /* PASS 2 — resolve each pair to exactly one fixture.
     Where a pair has several candidates, the league fixture is the one
     whose kickoff sits closest to the seeded date: a reschedule shifts a
     game by days or weeks, whereas a playoff or replay on the same pair
     lands far away. Losers are reported, never dropped silently. */
  for (const [key, list] of candidates) {
    const seedHit = seedByPair.get(key);
    const seedFx = seedHit.fixture;
    const h = seedHit.home;
    const a = seedHit.away;

    let chosen = list[0];
    if (list.length > 1) {
      const seedTs = seedFx.kickoffUTC ? new Date(seedFx.kickoffUTC).getTime() : null;
      const distance = c => {
        const iso = nlsKickoffToISO(c.attrs.kickOffDateUTC);
        const ko = iso ? new Date(iso).getTime() : null;
        return (seedTs == null || ko == null) ? Number.MAX_SAFE_INTEGER : Math.abs(ko - seedTs);
      };
      chosen = list.reduce((best, c) => (distance(c) < distance(best) ? c : best), list[0]);
      for (const loser of list) {
        if (loser === chosen) continue;
        unmatchedNls.push({
          matchID: loser.raw.id,
          home: loser.h.name, away: loser.a.name,
          kickoffUTC: nlsKickoffToISO(loser.attrs.kickOffDateUTC),
          reason: `duplicate pair — ${chosen.raw.id} matched the seeded fixture more closely ` +
                  '(likely a playoff, replay or abandoned-game rematch; needs its own ID)'
        });
      }
    }

    const raw = chosen.raw;
    const attrs = chosen.attrs;
    const nlsHome = chosen.nlsHome;
    const nlsAway = chosen.nlsAway;
    matchedPairs.add(key);
    const currentUTC = nlsKickoffToISO(attrs.kickOffDateUTC);
    const moved = !!(currentUTC && seedFx.kickoffUTC) &&
                  new Date(currentUTC).getTime() !== new Date(seedFx.kickoffUTC).getTime();

    const record = {
      matchID: String(raw.id),
      competitionID: attrs.competitionID || Number(opts.competition),
      division: seedFx.division,
      seasonID: String(opts.season),

      original: { date: seedFx.date, kickoff: seedFx.kickoff, kickoffUTC: seedFx.kickoffUTC },
      current: { kickoffUTC: currentUTC, ...splitUK(currentUTC) },
      rescheduled: moved,

      homeTeam: { name: h.name, clubKey: h.key, optaID: h.optaID,
                  nlsTeamID: nlsHome.teamID != null ? String(nlsHome.teamID) : null },
      awayTeam: { name: a.name, clubKey: a.key, optaID: a.optaID,
                  nlsTeamID: nlsAway.teamID != null ? String(nlsAway.teamID) : null },

      homeScore: (nlsHome.score === 0 || nlsHome.score) ? nlsHome.score : null,
      awayScore: (nlsAway.score === 0 || nlsAway.score) ? nlsAway.score : null,
      matchPeriod: attrs.matchPeriod || null,
      venue: attrs.venue || null,
      postponementReason: attrs.postponementReason || null,
      dazn: seedFx.dazn
    };
    merged.push(record);

    if (moved) {
      rescheduled.push({
        matchID: record.matchID,
        fixture: `${h.name} v ${a.name}`,
        from: `${seedFx.date} ${seedFx.kickoff}`,
        to: record.current.date ? `${record.current.date} ${record.current.kickoff}` : currentUTC,
        fromUTC: seedFx.kickoffUTC,
        toUTC: currentUTC
      });
    }
  }

  /* Seeded fixtures NLS never mentioned. */
  const unmatchedSeed = [];
  for (const [key, hit] of seedByPair) {
    if (matchedPairs.has(key)) continue;
    unmatchedSeed.push({
      fixture: `${hit.home.name} v ${hit.away.name}`,
      date: hit.fixture.date,
      kickoff: hit.fixture.kickoff,
      reason: 'no NLS match found for this pair'
    });
  }

  merged.sort((x, y) => String(x.current.kickoffUTC || x.original.kickoffUTC || '')
    .localeCompare(String(y.current.kickoffUTC || y.original.kickoffUTC || '')));

  return { merged, rescheduled, unmatchedSeed, unmatchedNls, unresolvedSeed };
}

/* ISO UTC -> { date: DD/MM/YYYY, kickoff: HH:MM } in UK local time. */
function splitUK(iso) {
  if (!iso) return { date: null, kickoff: null };
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return { date: null, kickoff: null };
  const local = new Date(ts + ukOffsetMs(ts));
  const p = n => String(n).padStart(2, '0');
  return {
    date: `${p(local.getUTCDate())}/${p(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`,
    kickoff: `${p(local.getUTCHours())}:${p(local.getUTCMinutes())}`
  };
}

/* ---- Main ------------------------------------------------------------- */

async function main() {
  const opts = parseArgs(process.argv);

  const seedDoc = JSON.parse(fs.readFileSync(opts.seed, 'utf8'));
  const meta = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'assets/data/clubs-meta.json'), 'utf8'));
  const clubIdx = buildClubIndex(meta);

  const seedFixtures = parseSeed(seedDoc, opts.division);
  console.error(`Seed: ${seedFixtures.length} ${opts.division} fixtures from ${path.relative(REPO_ROOT, opts.seed)} (exported ${seedDoc.updated || 'unknown'})`);
  if (!seedFixtures.length) throw new Error(`No fixtures found for division "${opts.division}"`);

  let nlsMatches;
  if (opts.fetch) {
    console.error(`Fetching NLS competitionID=${opts.competition} seasonID=${opts.season}...`);
    nlsMatches = await fetchCompetition(opts.competition, opts.season);
  } else {
    console.error(`Reading NLS payload from ${opts.nls}`);
    nlsMatches = extractMatches(JSON.parse(fs.readFileSync(opts.nls, 'utf8')));
  }
  console.error(`NLS: ${nlsMatches.length} matches`);

  const result = build(seedFixtures, nlsMatches, clubIdx, opts);

  fs.mkdirSync(opts.out, { recursive: true });
  const stem = `fixture-seed-${opts.season}-${opts.competition}`;
  const seedOut = path.join(opts.out, `${stem}.json`);
  const reportOut = path.join(opts.out, `${stem}.report.json`);
  const csvOut = path.join(opts.out, `${stem}.csv`);

  fs.writeFileSync(seedOut, JSON.stringify({
    seasonID: String(opts.season),
    competitionID: Number(opts.competition),
    division: opts.division,
    generatedAt: new Date().toISOString(),
    seedExportedAt: seedDoc.updated || null,
    schemaVersion: 1,
    count: result.merged.length,
    fixtures: result.merged
  }, null, 2));

  fs.writeFileSync(reportOut, JSON.stringify({
    generatedAt: new Date().toISOString(),
    seasonID: String(opts.season),
    competitionID: Number(opts.competition),
    division: opts.division,
    counts: {
      seed: seedFixtures.length,
      nls: nlsMatches.length,
      matched: result.merged.length,
      rescheduled: result.rescheduled.length,
      unmatchedSeed: result.unmatchedSeed.length,
      unmatchedNls: result.unmatchedNls.length,
      unresolvedSeedNames: result.unresolvedSeed.length
    },
    rescheduled: result.rescheduled,
    unmatchedSeed: result.unmatchedSeed,
    unmatchedNls: result.unmatchedNls,
    unresolvedSeedNames: result.unresolvedSeed
  }, null, 2));

  /* ---- Opta ID extract (CSV, for marrying into a spreadsheet) ----
     Deliberately carries the ORIGINAL seeded date, not the NLS one: the
     seed is what gets imported, and any move since then is entered by
     hand through the tool so the history entry is genuine rather than
     inferred. currentDate/currentKickoff are reference columns only --
     they exist to tell you WHICH fixtures need that manual step. */
  const csvRows = [[
    'matchID', 'division', 'home', 'away', 'lookupKey',
    'seedDate', 'seedKickoff', 'changedSinceSeed', 'currentDate', 'currentKickoff'
  ]];
  for (const f of result.merged) {
    csvRows.push([
      f.matchID, f.division, f.homeTeam.name, f.awayTeam.name,
      `${f.homeTeam.name} v ${f.awayTeam.name}`,
      f.original.date || '', f.original.kickoff || '',
      f.rescheduled ? 'YES' : '',
      f.rescheduled ? (f.current.date || '') : '',
      f.rescheduled ? (f.current.kickoff || '') : ''
    ]);
  }
  const csvCell = v => {
    const t = String(v == null ? '' : v);
    return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  fs.writeFileSync(csvOut, csvRows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n');

  /* ---- Console summary ---- */
  const c = result;
  console.error('');
  console.error('  matched          ' + c.merged.length + ' / ' + seedFixtures.length);
  console.error('  rescheduled      ' + c.rescheduled.length + '  (kickoff differs from the seed)');
  console.error('  unmatched seed   ' + c.unmatchedSeed.length);
  console.error('  unmatched NLS    ' + c.unmatchedNls.length + '  (new fixtures, or teams outside this division)');
  if (c.unresolvedSeed.length) console.error('  unresolved names ' + c.unresolvedSeed.length + '  <- needs a clubs-meta fix');
  console.error('');
  if (c.rescheduled.length) {
    console.error('  First few reschedules:');
    for (const r of c.rescheduled.slice(0, 8)) {
      console.error(`    ${r.fixture.padEnd(42)} ${r.from}  ->  ${r.to}`);
    }
    if (c.rescheduled.length > 8) console.error(`    ... and ${c.rescheduled.length - 8} more (see the report)`);
    console.error('');
  }
  console.error(`  seed   -> ${path.relative(process.cwd(), seedOut)}`);
  console.error(`  report -> ${path.relative(process.cwd(), reportOut)}`);
  console.error(`  csv    -> ${path.relative(process.cwd(), csvOut)}`);

  if (opts.expect != null && c.merged.length !== opts.expect) {
    console.error(`\nFAIL: expected ${opts.expect} matched fixtures, got ${c.merged.length}`);
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error('\nERROR: ' + err.message);
  process.exitCode = 1;
});
