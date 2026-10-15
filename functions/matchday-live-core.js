/**
 * matchday-live-core.js — the pure half of Matchday Live.
 *
 * No firebase-admin, no firebase-functions, no clock. Every decision the
 * server makes about who gets in, what a match looks like to the tool, which
 * event a clip belongs to and which clips are past keeping is a function of
 * its arguments here — so tests/matchday-live.test.mjs can require this file
 * straight off disk and pin it without an emulator. matchday-live.js owns
 * every database and Storage call and nothing else.
 *
 * CHANGELOG
 *   15/10/2026  v1.0  Initial build: token hashing, the matchday mirror shape,
 *                     ±2 minute auto-match, retention plan.
 */

'use strict';

const crypto = require('crypto');

/* Competitions the tool covers. The Cup is left out on purpose — the handover
   scopes v1 to the three divisions, and Cup ties would put clubs on the card
   twice on a midweek that also has league games. Adding it is one entry. */
const COMPS = ['nl', 'north', 'south'];

/* Link tokens: 24 random bytes as base64url, 32 characters. Same entropy as
   the Brand Exposure ingest key and for the same reason — the token is never
   read aloud, so it can be long enough that the stored form is a hash rather
   than the thing itself. */
const TOKEN = /^[A-Za-z0-9_-]{32}$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/* The first 16 hex characters of the hash ride in the custom token as
   `mdlGen`. Rules compare it with the stored hash, so rotating a link changes
   the stored hash and every session minted from the old one stops working on
   its next read, without waiting for the ID token to expire. */
const GEN_LEN = 16;

/* Clip ↔ event matching window, in match minutes (handover §5). */
const MATCH_WINDOW_MIN = 2;

/* Retention (decided 15/10/2026): rejected clips are deleted seven days after
   they were rejected. A clip still marked `uploading` a day later is an upload
   that never finished — its record is noise and its object, if any, is a
   partial file. */
const REJECTED_KEEP_MS = 7 * 24 * 3600 * 1000;
const STALE_UPLOAD_MS = 24 * 3600 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function validToken(t) {
  return typeof t === 'string' && TOKEN.test(t);
}

function validYmd(s) {
  return typeof s === 'string' && YMD.test(s);
}

function genOf(hash) {
  return String(hash || '').slice(0, GEN_LEN);
}

/* Can this contributor record be issued a session? Fail closed: a record with
   no hash, or with active anything other than literally true, gets nothing. */
function contributorUsable(rec, secret) {
  return Boolean(rec && rec.active === true &&
    secret && typeof secret.tokenHash === 'string' && secret.tokenHash.length === 64);
}

/* ---- The matchday mirror ------------------------------------------------ */

/* NLS booking fields are free text (`card`, `cardType`). A second yellow is a
   sending-off and is filed as red — that is the event a contributor films. */
function cardKind(b) {
  const t = ((b.card || '') + ' ' + (b.cardType || '')).toLowerCase();
  if (t.indexOf('second') !== -1) return 'red';
  if (t.indexOf('red') !== -1) return 'red';
  if (t.indexOf('yellow') !== -1) return 'yellow';
  return null;
}

/* One ingester event → the few fields the capture page and the feed draw.
   Substitutions, lineups and withdrawals are dropped: nobody films a sub. */
function compactEvent(e, homeID, awayID) {
  if (!e || e.retracted) return null;
  let kind = null;
  if (e.type === 'goal') kind = 'goal';
  else if (e.type === 'booking') kind = cardKind(e);
  if (!kind) return null;
  const team = e.teamID != null ? String(e.teamID) : null;
  const side = team && team === homeID ? 'home' : team && team === awayID ? 'away' : null;
  const out = {
    kind,
    minute: typeof e.minute === 'number' ? e.minute : null,
    fm: e.formattedMinute || null,
    side,
    player: e.playerName || null,
    at: typeof e.detectedAt === 'number' ? e.detectedAt : null,
  };
  if (kind === 'goal') {
    if (e.isPenalty) out.pen = true;
    if (e.isOwnGoal) out.og = true;
  }
  return out;
}

function side(s) {
  const x = s || {};
  return {
    id: x.id != null ? String(x.id) : null,
    name: x.name || '',
    score: typeof x.score === 'number' ? x.score : null,
  };
}

/* indexByComp — { nl: { <matchID>: row }, north: {...}, south: {...} } from
   nls/live/index/<comp>/<ymd>. events — nls/events/<ymd>, keyed by eventKey.
   Returns { <matchID>: record } for matchdays/<ymd>. */
function buildMatchday(indexByComp, events) {
  const out = {};
  COMPS.forEach((comp) => {
    const rows = (indexByComp && indexByComp[comp]) || {};
    Object.keys(rows).forEach((id) => {
      const r = rows[id];
      if (!r || !r.id) return;
      const home = side(r.home), away = side(r.away);
      out[String(r.id)] = {
        comp,
        ko: r.ko || null,
        period: r.period || null,
        live: r.live === true,
        finished: r.finished === true,
        postponed: r.postponed === true,
        minute: typeof r.minute === 'number' ? r.minute : null,
        fm: r.formattedMinute || null,
        home,
        away,
        events: {},
        updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : null,
      };
    });
  });
  Object.keys(events || {}).forEach((key) => {
    const e = events[key];
    const m = e && out[String(e.matchID)];
    if (!m) return;
    const c = compactEvent(e, m.home.id, m.away.id);
    if (c) m.events[key] = c;
  });
  return out;
}

/* Stable stringify → sha1, so a minute where nothing on the pitch changed
   writes nothing. `updatedAt` moves on every ingester run, so it is left out
   of the comparison — otherwise every tick would be a write. */
function contentHash(matchday) {
  const strip = {};
  Object.keys(matchday || {}).sort().forEach((id) => {
    const m = Object.assign({}, matchday[id]);
    delete m.updatedAt;
    strip[id] = m;
  });
  const stable = (v) => {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  };
  return crypto.createHash('sha1').update(stable(strip)).digest('hex');
}

/* ---- Clip ↔ event --------------------------------------------------------- */

const KIND_RANK = { goal: 0, red: 1, yellow: 2 };

/* The event a pending clip belongs to, or null. A clip tagged "just happened"
   was filmed before the feed carried the event; when an event lands within
   ±2 minutes of the clip's minute it is almost certainly the one. Goals beat
   cards when both are in the window, then the nearest minute, then the
   latest-detected. */
function autoMatch(clip, matchRecord) {
  if (!clip || typeof clip.minute !== 'number' || !matchRecord) return null;
  const events = matchRecord.events || {};
  let best = null;
  Object.keys(events).forEach((key) => {
    const e = events[key];
    if (!e || typeof e.minute !== 'number') return;
    const diff = Math.abs(e.minute - clip.minute);
    if (diff > MATCH_WINDOW_MIN) return;
    const cand = { key, rank: KIND_RANK[e.kind] != null ? KIND_RANK[e.kind] : 9, diff, at: e.at || 0 };
    if (!best ||
        cand.rank < best.rank ||
        (cand.rank === best.rank && cand.diff < best.diff) ||
        (cand.rank === best.rank && cand.diff === best.diff && cand.at > best.at)) {
      best = cand;
    }
  });
  return best ? best.key : null;
}

/* ---- Retention -------------------------------------------------------------- */

/* clipsByDay — { <ymd>: { <clipId>: clip } }. Returns the actions to take:
     { ymd, clipId, action: 'purge', storagePath }  rejected ≥7 days: delete the
                                                    video, keep the record
                                                    (an audit line still
                                                    resolves to who sent what)
     { ymd, clipId, action: 'drop',  storagePath }  upload never finished:
                                                    delete record and object */
function retentionPlan(clipsByDay, now) {
  const out = [];
  Object.keys(clipsByDay || {}).forEach((ymd) => {
    const day = clipsByDay[ymd] || {};
    Object.keys(day).forEach((clipId) => {
      const c = day[clipId];
      if (!c) return;
      if (c.status === 'rejected' && c.storagePath && !c.purgedAt &&
          typeof c.reviewedAt === 'number' && now - c.reviewedAt >= REJECTED_KEEP_MS) {
        out.push({ ymd, clipId, action: 'purge', storagePath: c.storagePath });
      } else if (c.status === 'uploading' &&
          typeof c.createdAt === 'number' && now - c.createdAt >= STALE_UPLOAD_MS) {
        out.push({ ymd, clipId, action: 'drop', storagePath: c.storagePath || null });
      }
    });
  });
  return out;
}

/* The UTC days the retention sweep looks at: yesterday back to `span` days.
   Bounded so the nightly job never walks the whole history — a clip rejected
   more than `span` days after it was recorded would be missed, which at 60
   days is a review backlog nobody has. */
function retentionDays(now, span) {
  const days = [];
  for (let i = 1; i <= (span || 60); i++) {
    days.push(new Date(now - i * 86400000).toISOString().slice(0, 10));
  }
  return days;
}

module.exports = {
  COMPS, GEN_LEN, MATCH_WINDOW_MIN, REJECTED_KEEP_MS, STALE_UPLOAD_MS,
  hashToken, validToken, validYmd, genOf, contributorUsable,
  cardKind, compactEvent, buildMatchday, contentHash,
  autoMatch, retentionPlan, retentionDays,
};
