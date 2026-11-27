/**
 * NL Tools — the pure half of externals.js: no Firebase, tested on its own
 * (tests/externals-core.test.mjs) with the real canon loaded.
 */

/* JSON with keys sorted, so two objects that mean the same compare equal. */
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  }
  return JSON.stringify(v === undefined ? null : v);
}

/* The write that brings one person's pass.ext in line with their
   organisation's zones, as { path: value }, or {} when it already is.
   Someone not on an External card holds no ext at all. */
function extUpdate(NL, uid, pass, org, registry, now) {
  const path = "users/" + uid + "/pass/ext";
  const have = pass && pass.ext ? pass.ext : null;
  if (!NL.pass.isExternal(pass)) return have ? { [path]: null } : {};
  const want = NL.pass.extFor(pass, org || null, registry || {}, now);
  const next = Object.keys(want).length ? JSON.parse(JSON.stringify(want)) : null;
  return stable(next) === stable(have) ? {} : { [path]: next };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

/* An invite request, checked. Returns { error } or { ok: { … } }. `org` is
   externals/<orgId>; zones must be its own; an end date, when given, must
   be in the future. */
function checkInvite(req, org, now) {
  if (!req || typeof req !== "object") return { error: "Empty request." };
  const email = clean(req.email, 200).toLowerCase();
  const name = clean(req.name, 120);
  if (!EMAIL.test(email)) return { error: "That email address does not look right." };
  if (!name) return { error: "A name is needed." };
  if (!org || !org.zones) return { error: "That organisation does not exist, or has no zones." };
  const zones = Object.keys(req.zones || {}).filter((z) => req.zones[z] === true);
  if (!zones.length) return { error: "Choose at least one zone." };
  const bad = zones.filter((z) => !org.zones[z]);
  if (bad.length) return { error: "A zone chosen is not this organisation's." };
  let until = null;
  if (req.until != null) {
    until = Number(req.until);
    if (!isFinite(until) || until <= now) return { error: "The end date must be in the future." };
  }
  /* An end date per zone (16/11/2026: the issue form gives each zone its
     own), for the zones asked for only. */
  const untils = {};
  const raw = req.untils && typeof req.untils === "object" ? req.untils : {};
  for (const z of zones) {
    if (raw[z] == null) continue;
    const u = Number(raw[z]);
    if (!isFinite(u) || u <= now) return { error: "Every end date must be in the future." };
    untils[z] = u;
  }
  return { ok: { email, name, jobTitle: clean(req.jobTitle, 80), zones, until, untils } };
}

/* The account record an accepted invite writes. */
function externalUser(ok, orgId, org, by, now) {
  const keys = {};
  ok.zones.forEach((z) => {
    keys[z] = { given: now, by };
    const until = (ok.untils && ok.untils[z]) || ok.until;
    if (until) keys[z].until = until;
  });
  return {
    name: ok.name,
    email: ok.email,
    role: "external",
    org: clean(org.name, 120),
    orgKey: orgId,
    jobTitle: ok.jobTitle,
    tools: {},
    pass: { base: "external", org: orgId, jobTitle: ok.jobTitle, keys, issued: now, issuedBy: by },
  };
}

module.exports = { stable, extUpdate, checkInvite, externalUser };
