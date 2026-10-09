/* ============================================================
   Rounds — what number a match day's card carries
   File: /graphics/_shared/rounds.js
   Version: v1.0 (09/10/2026)

   One copy of the rule for the scheduled batch (scripts/build-fixtures-
   graphics.js, via require) and the Fixtures & Results tool (in the
   browser, as window.NL_ROUNDS), so a card made by hand and one made on the
   timer are titled the same way.

   Data: assets/data/rounds-<season>.json — per competition, a list of
   { round, main, from, to, title? }. A date inside a round's from–to window
   prints that round's number, whatever round the fixture officially belongs
   to; outside every window the card says plain MATCHDAY (the Cup: GROUP
   STAGE). A round can carry a "title" to override the wording, for the
   Cup's knockout rounds. Rules agreed with Richard on 09/10/2026.

   API
     roundFor(rounds, division, ymd)   → the round whose window holds ymd, or null
     cardTitle(rounds, division, ymd)  → "13" | "" | "GROUP STAGE – MATCHDAY 3" | …
     roundDays(rounds, division, ymd, matchDays)
                                       → the match days in ymd's round (just
                                         [ymd] when it sits in no round)

   CHANGELOG
     v1.0 09/10/2026  Lifted from scripts/build-fixtures-graphics.js v1.6.
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NL_ROUNDS = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  function roundFor(rounds, division, ymd) {
    var list = (rounds && rounds[division]) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].from <= ymd && ymd <= list[i].to) return list[i];
    }
    return null;
  }

  /* League: "13" → MATCHDAY 13, "" → MATCHDAY. The Cup's group rounds read
     "GROUP STAGE – MATCHDAY 3" (breaks at the dash) and a group-stage date
     outside every window reads GROUP STAGE. */
  function cardTitle(rounds, division, ymd) {
    var r = roundFor(rounds, division, ymd);
    if (r && r.title) return r.title;
    if (division !== "Cup") return r ? String(r.round) : "";
    if (r) return "GROUP STAGE – MATCHDAY " + r.round;
    var group = (rounds && rounds.Cup) || [];
    var lastGroupDay = group.length ? group[group.length - 1].to : "";
    return ymd <= lastGroupDay ? "GROUP STAGE" : "";
  }

  function roundDays(rounds, division, ymd, matchDays) {
    var r = roundFor(rounds, division, ymd);
    if (!r) return [ymd];
    return (matchDays || []).filter(function (d) { return r.from <= d && d <= r.to; }).sort();
  }

  return { roundFor: roundFor, cardTitle: cardTitle, roundDays: roundDays };
});
