/* ============================================================
   Engine — CSV/TSV parsing + zone model.
   Parsing ported from the existing tool (v3.0). Zone model
   extended so EVERY rank stays visible; C / PO / R become
   colour bands + a legend instead of replacing the number.
   ============================================================ */
(function () {
  "use strict";

  var FLAG_NONE = "-", FLAG_C = "C", FLAG_SF = "SF", FLAG_QF = "QF", FLAG_R = "R";
  var VALID_FLAGS = { "-":1, "C":1, "SF":1, "QF":1, "R":1 };

  function safeText(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function splitLine(line) {
    if (line.indexOf("\t") >= 0) return line.split("\t").map(function (s) { return s.trim(); });
    if (line.indexOf(",") >= 0) return line.split(",").map(function (s) { return s.trim(); });
    return line.trim().split(/\s{2,}|\s+\|\s+|\s+/).map(function (s) { return s.trim(); });
  }

  function isNumLike(s) {
    var v = String(s || "").trim();
    return /^[-+]?(\d+)$/.test(v) || /^[-+]?(\d+)\.(\d+)$/.test(v);
  }

  function isHeader(cells) {
    var j = cells.map(function (c) { return String(c || ""); }).join(" ").toLowerCase();
    return j.indexOf("team") >= 0 && (j.indexOf("pts") >= 0 || j.indexOf("points") >= 0);
  }

  function clamp3(s) { return String(s || "").slice(0, 3); }
  function digits3(s) { return clamp3(String(s || "").replace(/[^\d]/g, "")); }
  function gd3(s) {
    var v = String(s || "").toUpperCase().replace(/[^0-9+\-]/g, "");
    if (v.length >= 2) {
      var f = v[0];
      if (f === "+" || f === "-") v = f + v.slice(1).replace(/[+\-]/g, "");
      else v = v.replace(/[+\-]/g, "");
    }
    return clamp3(v);
  }

  /* Parse pasted text into an array of {team, p, gd, pts, flag}.
     Accepts the user's CSV: <flag|pos> team p w d l f a gd pts
     We keep P (first number), Pts (last), GD (second-to-last). */
  function parse(raw) {
    var text = (raw || "").replace(/\r/g, "\n");
    var lines = text.split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
    var out = [];
    if (!lines.length) return out;

    var start = 0;
    var first = splitLine(lines[0]);
    if (first.length && isHeader(first)) start = 1;

    for (var i = start; i < lines.length; i++) {
      var cells = splitLine(lines[i]).filter(function (s) { return String(s || "").trim().length; });
      if (!cells.length || isHeader(cells)) continue;

      var c0 = safeText(cells[0] || "").toUpperCase();
      var isNum = /^\d+$/.test(c0);
      var isFlag = VALID_FLAGS[c0] === 1;

      var teamIdx = 0, flag = FLAG_NONE;
      if (isNum) { teamIdx = 1; }
      else if (isFlag) { teamIdx = 1; flag = c0; }

      var team = safeText(cells[teamIdx] || "");
      var rest = cells.slice(teamIdx + 1);
      var nums = rest.filter(isNumLike).map(function (s) { return String(s).trim(); });

      var p = nums.length >= 1 ? nums[0] : "";
      var pts = nums.length >= 1 ? nums[nums.length - 1] : "";
      var gd = nums.length >= 2 ? nums[nums.length - 2] : "";
      var w = "", d = "", l = "", f = "", a = "";
      if (nums.length >= 8) {
        /* full row: P W D L F A GD Pts */
        w = nums[1]; d = nums[2]; l = nums[3]; f = nums[4]; a = nums[5];
      }

      out.push({
        team: team, flag: flag,
        p: digits3(p), w: digits3(w), d: digits3(d), l: digits3(l),
        f: digits3(f), a: digits3(a), gd: gd3(gd), pts: digits3(pts)
      });
    }
    return out;
  }

  /* Resolve the qualification zone for a row.
     Priority: explicit flag > numeric default for the division. */
  function zoneFor(flag, pos, total, division) {
    var f = safeText(flag || FLAG_NONE).toUpperCase();
    if (f === FLAG_C)  return "champ";
    if (f === FLAG_SF) return "po-sf";
    if (f === FLAG_QF) return "po-qf";
    if (f === FLAG_R)  return "releg";

    var relegFrom = total - 3; /* bottom 4 by default */
    if (pos === 1) return "champ";
    if (pos >= 2 && pos <= 3) return "po-sf";
    if (pos >= 4 && pos <= 7) return "po-qf";
    if (total > 7 && pos >= relegFrom) return "releg";
    return "mid";
  }

  var ZONE_GROUP = { "champ": "champ", "po-sf": "po", "po-qf": "po", "releg": "releg", "mid": "mid" };

  window.NLEngine = {
    parse: parse,
    zoneFor: zoneFor,
    zoneGroup: function (z) { return ZONE_GROUP[z] || "mid"; },
    safeText: safeText,
    FLAG_NONE: FLAG_NONE
  };
})();
