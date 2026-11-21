/**
 * NL Tools — the pass an invite carries (16/11/2026), the pure half:
 * no Firebase, tested in tests/invite-pass.test.mjs with the real canon.
 *
 * An invite is issued on the same Issue a pass form as everyone's pass. The
 * invite itself (admin/invites/<token>) is written by Apps Script, which
 * sends the email; the pass waits beside it at admin/invite-passes/<token>,
 * written by whoever sent the invite (the rules make `by` their own uid).
 * When the invite is accepted, consumeInvite asks this for the pass to put on
 * the new account, and checks everything again on the server:
 *
 *   - the issuer, read from users/<by>, may give this card (NL.pass
 *     issueRights: a League card and the Skeleton key are the Skeleton key's;
 *     a Club card is League Operations' or the Skeleton key's);
 *   - the card matches the invite (a League card for a League role, a Club
 *     card for a club role and the same club);
 *   - the pass is rebuilt by NL.pass.build, so only its known parts survive.
 *
 * Anything that fails gives no pass, and the account starts with its role
 * only, as every invite did before.
 */
function invitePass(NL, record, issuer, invite, now) {
  const P = NL.pass;
  if (!record || !record.pass || typeof record.pass !== "object" || !record.by) return { reason: "no pass on the invite" };
  if (!issuer) return { reason: "the issuer has no account" };
  const want = record.pass;
  if (want.base !== "league" && want.base !== "club") return { reason: "not a League or Club card" };
  const rights = issuer.role === "superadmin" ? { league: true, club: true, skeleton: true } : P.issueRights(issuer.pass, now);
  if (want.base === "league" && !rights.skeleton) return { reason: "a League card is the Skeleton key's to give" };
  if (want.base === "club" && !rights.club) return { reason: "the issuer cannot give a Club card" };
  const realm = NL.roles.realm(String((invite && invite.role) || ""));
  if (want.base === "league" && realm !== "league") return { reason: "a League card for a club role" };
  if (want.base === "club") {
    if (realm !== "club") return { reason: "a Club card for a League role" };
    if (String(want.club || "").trim() !== String((invite && invite.club) || "").trim()) return { reason: "a different club from the invite" };
  }
  const keys = Object.keys(want.keys || {});
  const until = {};
  keys.forEach((k) => { const u = want.keys[k] && want.keys[k].until; if (typeof u === "number" && u > now) until[k] = u; });
  let pass;
  try {
    pass = P.build({ base: want.base, club: want.club, jobTitle: want.jobTitle, keys, until, skeleton: !!want.skeleton && rights.skeleton }, record.by, now);
  } catch (e) {
    return { reason: "the pass would not build: " + (e && e.message) };
  }
  return { pass: JSON.parse(JSON.stringify(pass)) };
}

module.exports = { invitePass };
