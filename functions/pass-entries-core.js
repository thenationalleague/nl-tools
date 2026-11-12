/**
 * NL Tools — the pure half of pass-entries.js: no Firebase, so it is tested
 * on its own (tests/pass-entries.test.mjs) with the real canon loaded.
 */
/* The writes that bring one person's entries in line with their pass, as
   { "users/<uid>/tools/<key>": entry | null }. `only` limits it to one tool.
   Nothing for someone without an issued pass. */
function entryUpdates(NL, uid, user, registry, now, only) {
  const out = {};
  if (!user || !NL.pass.isIssued(user.pass)) return out;
  const want = NL.pass.toOld(user.pass, registry, user.role || "", now);
  const have = user.tools || {};
  Object.keys(want).forEach((k) => {
    if (only && k !== only) return;
    const w = want[k] === undefined ? null : want[k];
    const h = have[k] === undefined ? null : have[k];
    if (w !== h) out["users/" + uid + "/tools/" + k] = w;
  });
  return out;
}

/* Keys on this pass whose end date fell in (since, now]. */
function keysEnded(pass, since, now) {
  const keys = (pass && pass.keys) || {};
  return Object.keys(keys).filter((id) => {
    const u = keys[id] && keys[id].until;
    return typeof u === "number" && u > since && u <= now;
  });
}

module.exports = { entryUpdates, keysEnded };
