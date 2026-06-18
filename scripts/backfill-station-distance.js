#!/usr/bin/env node
/*
 * backfill-station-distance.js  —  standalone station-distance calculator.
 *
 * Works out the by-ROAD distance (miles) from each club's ground to its named
 * closest station and writes it into assets/data/clubs-meta.json. The club
 * contacts form (Club information step) reads `station_distance_mi` and shows it.
 *
 *   - Club coordinates: clubs-meta `lat` / `lng` (already present).
 *   - Station coordinates: geocoded from the club's `station` name via
 *     Nominatim (OpenStreetMap).
 *   - Road distance: OSRM public routing server (driving profile).
 *
 * Writes onto each club:
 *   station_distance_mi   number  (1 dp, by road)
 *   station_distance_from string  (the station name used)
 *   station_geocoded      string  (Nominatim display name — eyeball for bad matches)
 *
 * Idempotent: re-running overwrites only those three fields. Clubs without
 * lat/lng or a station name are skipped. A review table is printed — check the
 * geocoded column for obvious mismatches and override by hand / re-run with FORCE.
 *
 * NETWORK: needs egress to nominatim.openstreetmap.org and router.project-osrm.org.
 * The Claude Code sandbox blocks both, so run this where there's internet:
 *   - GitHub Action "Backfill station distance" (Actions tab → Run workflow), or
 *   - locally:  node scripts/backfill-station-distance.js   (Node 18+)
 *   - recompute everything:  FORCE=1 node scripts/backfill-station-distance.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const META_PATH = path.join(__dirname, '..', 'assets', 'data', 'clubs-meta.json');
const UA = 'nl-tools-station-backfill/1.0 (https://github.com/thenationalleague/tools)';
const FORCE = !!process.env.FORCE;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

// Nominatim geocode — bias to GB, prefer a railway/transport hit.
async function geocodeStation(name) {
  const q = encodeURIComponent(name + ' station');
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&q=' + q;
  const arr = await getJSON(url);
  if (!arr || !arr.length) return null;
  return { lat: parseFloat(arr[0].lat), lng: parseFloat(arr[0].lon), display: arr[0].display_name };
}

// OSRM driving distance (metres) between two [lng,lat] points.
async function roadMetres(fromLng, fromLat, toLng, toLat) {
  const url = 'https://router.project-osrm.org/route/v1/driving/' +
    fromLng + ',' + fromLat + ';' + toLng + ',' + toLat + '?overview=false';
  const j = await getJSON(url);
  if (!j || j.code !== 'Ok' || !j.routes || !j.routes.length) return null;
  return j.routes[0].distance;
}

(async function main() {
  const data = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  const clubs = Array.isArray(data.clubs) ? data.clubs : [];
  const review = [];
  let done = 0, skipped = 0, failed = 0;

  for (const c of clubs) {
    const stationName = Array.isArray(c.station) ? c.station[0] : c.station;
    if (c.lat == null || c.lng == null || !stationName) { skipped++; continue; }
    if (!FORCE && c.station_distance_mi != null) { review.push([c.name, c.station_distance_from, c.station_distance_mi + ' (kept)']); continue; }

    try {
      await sleep(1100); // Nominatim: <= 1 req/sec
      const stn = await geocodeStation(stationName);
      if (!stn) { failed++; review.push([c.name, stationName, 'NO GEOCODE']); continue; }
      const m = await roadMetres(c.lng, c.lat, stn.lng, stn.lat);
      if (m == null) { failed++; review.push([c.name, stationName, 'NO ROUTE']); continue; }
      const miles = Math.round((m / 1609.344) * 10) / 10;
      c.station_distance_mi = miles;
      c.station_distance_from = stationName;
      c.station_geocoded = stn.display;
      done++;
      // >= 20 mi almost always means a wrong geocode match — flag for a manual look.
      review.push([c.name, stationName, miles + ' mi' + (miles >= 20 ? '  ⚠ CHECK' : ''), stn.display]);
    } catch (e) {
      failed++;
      review.push([c.name, stationName, 'ERROR: ' + (e.message || e)]);
    }
  }

  fs.writeFileSync(META_PATH, JSON.stringify(data, null, 2) + '\n');

  console.log('\n=== Station distance backfill ===');
  review.forEach((r) => console.log(' • ' + r.join('  |  ')));
  console.log('\nupdated: ' + done + '  | skipped (no coords/station): ' + skipped + '  | failed: ' + failed);
  var flagged = clubs.filter(function (c) { return c.station_distance_mi != null && c.station_distance_mi >= 20; });
  if (flagged.length) {
    console.log('\n⚠ ' + flagged.length + ' look janky (>= 20 mi — probably a wrong station match). Eyeball / backfill by hand:');
    flagged.forEach(function (c) { console.log('   - ' + c.name + ': ' + c.station_distance_mi + ' mi from "' + c.station_distance_from + '" (' + c.station_geocoded + ')'); });
  }
  console.log('Review the matches above (esp. the geocoded column) before trusting the figures.');
})();
