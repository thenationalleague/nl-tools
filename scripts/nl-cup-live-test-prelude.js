/* Fixture shim for the NL Cup LIVE TEST bundle.
 *
 * This file is not a widget and is never served on its own. It is spliced
 * into embeds/nl-cup-live-test.js by scripts/build-embeds.js, ahead of the
 * real widget's code, so the test bundle IS the shipping widget — same CSS,
 * same markup, same JavaScript — fed a made-up fixture list.
 *
 * Why it exists: the cup plays on about ten days a season and the band
 * correctly renders nothing on the other 355, which makes it impossible to
 * look at the thing in the real page template on any ordinary afternoon.
 *
 * Only the match list is faked. Club data, crests, colours and the stream
 * links are all fetched for real, so this exercises those too.
 *
 * Scenario comes off the marker div:
 *   <div data-nl-cup-live-test></div>          16 ties, every state at once
 *   <div data-nl-cup-live-test="one"></div>    a single tie — the solo band
 *   <div data-nl-cup-live-test="eve"></div>    tomorrow's round — the MD-1 preview
 *   <div data-nl-cup-live-test="none"></div>   an empty day — renders nothing
 *   <div data-nl-cup-live-test="done"></div>   a finished card — also nothing
 */
(function () {
  var marker = document.querySelector('[data-nl-cup-live-test]');
  var scenario = String((marker && marker.getAttribute('data-nl-cup-live-test')) || '')
    .trim().toLowerCase();

  /* Kick-offs are written relative to load, so the 15-minute arming is
     exercised for real rather than described. */
  function ko(minsFromNow) {
    var d = new Date(Date.now() + minsFromNow * 60000);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
      ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':00';
  }

  function tie(home, away, mins, period) {
    return {
      id: 'test-' + home.replace(/\W/g, ''),
      attributes: {
        kickOffDateUTC: ko(mins),
        matchPeriod: period || 'PreMatch',
        competitionID: 1275,
        homeTeam: { name: home },
        awayTeam: { name: away },
        postponementReason: period === 'Postponed' ? 'Waterlogged pitch' : null
      }
    };
  }

  /* The real 18/08/2026 round, moved onto today and spread across every state
     the band can draw, so one look covers the lot: live, half time, full time,
     postponed, armed (button) and not yet armed ("Watch from"). */
  var FULL = [
    tie('Boreham Wood', 'Leeds United PL2', -38, 'SecondHalf'),
    tie('Boston United', 'Birmingham City U21', -38, 'HalfTime'),
    tie('FC Halifax Town', 'Derby County PL2', -115, 'FullTime'),
    tie('Gateshead', 'Nottingham Forest PL2', -38, 'Postponed'),
    tie('Hornchurch', 'Norwich City U21', 6),
    tie('Scunthorpe United', 'Stoke City PL2', 6),
    tie('Solihull Moors', 'Middlesbrough PL2', 6),
    tie('Sutton United', 'Leicester City PL2', 45),
    tie('Truro City', 'Southampton PL2', 45),
    tie('Wealdstone', 'Wolverhampton Wanderers PL2', 45),
    tie('Braintree Town', 'Ipswich Town U21', 45),
    tie('Worthing', 'West Ham United PL2', 45),
    tie('Aldershot Town', 'Fulham PL2', 75),
    tie('Tamworth', 'Newcastle United PL2', 75),
    tie('Woking', 'West Bromwich Albion PL2', 75),
    tie('Hartlepool United', 'Middlesbrough PL2', 75)
  ];

  /* Every tie already played, which is the state the band has to disappear
     from — the real 11/08/2026 card an hour after the whistle. */
  var DONE = [
    tie('Hartlepool United', 'Middlesbrough PL2', -180, 'FullTime'),
    tie('Gateshead', 'Nottingham Forest PL2', -180, 'Postponed')
  ];

  /* Minutes from now to a given UK-evening hour TOMORROW, computed rather than
     a flat +24h so the scenario still lands on tomorrow when loaded late at
     night. Local clock arithmetic — this harness runs on staff machines in
     the UK, which is the one place anyone looks at it. */
  function minsTomorrow(h) {
    var now = new Date();
    var t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(h, 45, 0, 0);
    return Math.round((t - now) / 60000);
  }

  /* Tomorrow's round as the eve preview shows it: pre ties only, a flat
     Tomorrow pill in the cap, KO times, and no Watch button or "Watch from"
     line however close the clock gets. */
  var EVE = [
    tie('Sutton United', 'Leicester City PL2', minsTomorrow(18)),
    tie('Truro City', 'Southampton PL2', minsTomorrow(18)),
    tie('Braintree Town', 'Ipswich Town U21', minsTomorrow(19)),
    tie('Hartlepool United', 'Middlesbrough PL2', minsTomorrow(19))
  ];

  var MATCHES = scenario === 'none' ? []
    : scenario === 'done' ? DONE
    : scenario === 'eve' ? EVE
    : scenario === 'one' ? [tie('Hartlepool United', 'Middlesbrough PL2', 6)]
    : FULL;

  /* Only the match list is intercepted. Everything else — clubs-meta,
     cup-clubs-meta, the link map, every crest — goes to the real network. */
  var realFetch = window.fetch;
  window.fetch = function (url) {
    if (String(url).indexOf('/v2/matches/') === -1) {
      return realFetch.apply(window, arguments);
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function () { return Promise.resolve({ data: MATCHES }); }
    });
  };

  /* Said on the band itself, not just in the console. If this bundle is ever
     pasted onto the live homepage by mistake, the page will be showing fans
     fixtures that do not exist, and the only acceptable way for that to fail
     is loudly. */
  var flag = document.createElement('style');
  flag.textContent =
    '#nlCupLive .nlcl__cap::after{' +
    'content:"Test data — not real fixtures";' +
    'display:block;margin-top:7px;padding:2px 7px 3px;border-radius:3px;' +
    'background:#c96f15;color:#fff;font-size:10px;letter-spacing:.06em;' +
    'text-transform:uppercase;font-weight:800;font-variation-settings:\'wght\' 800;}';
  document.head.appendChild(flag);

  if (window.console && console.warn) {
    console.warn('[NL Cup Live TEST] serving ' + MATCHES.length +
      ' made-up ties (scenario: ' + (scenario || 'full') + '). Not for the live page.');
  }
})();
