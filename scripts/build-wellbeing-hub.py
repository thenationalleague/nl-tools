#!/usr/bin/env python3
"""Emit /wellbeing-hub/index.html and poster.html from one content file.

  python3 scripts/build-wellbeing-hub.py            # write the files
  python3 scripts/build-wellbeing-hub.py --check    # fail if they have drifted

THIS FILE IS THE SOURCE OF TRUTH. The two HTML files it writes are generated
artefacts that happen to be committed, because the site is served straight from
the repo with no build step. Edit the content at wellbeing-hub/_src/content.json
or the markup here — never the generated HTML, which is overwritten.

IT LIVED IN A TEMP DIRECTORY UNTIL 13/10/2026. The generator and the content
sat in a Claude Code session scratchpad from 05/10, so the hub's only real
source was one container restart away from being gone, leaving a 134KB hand-
maintained HTML file behind. It moved here the moment a SECOND edition was
asked for, because "only ever update a single data source" is not a thing you
can promise about a file in /tmp.

tests/wellbeing-hub-build.test.mjs runs --check on every push, so the committed
HTML can no longer drift from this file without CI saying so.

The copy is Martyn's and is reproduced verbatim. Everything around it is new:
brand tokens instead of ~60 loose hex values, the canon type scale instead of
110 fixed pixel sizes, one stylesheet instead of five stacked override passes,
and sprite glyphs instead of 26 hand-drawn SVGs.
"""

import io
import json
import os
import re
import sys
import html as H

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(REPO, 'wellbeing-hub', '_src', 'content.json')

d = json.load(open(DATA, encoding='utf-8'))

# ── Editions ──────────────────────────────────────────────────────────────
#
# ONE content file, two sites. Asked for on 13/10/2026: Benny Watson worked on
# the hub and wanted a Trident Leagues copy for his 300-plus clubs, with the
# requirement that "we only ever update a single data source and they sync
# properly".
#
# So everything below is the ONLY thing that differs. The copy, the topics, the
# helplines, the layout and the behaviour are shared by construction rather
# than by discipline — there is no second template to keep in step, and
# tests/wellbeing-hub-build.test.mjs fails the build if either committed
# edition has drifted from this file.
#
# A new edition is a dict in this list. Nothing else should need touching.
#
#   lead_first  surname of the safeguarding lead who goes FIRST. Keyed by
#               surname, not index, for the same reason LEAD_PHOTOS is: an
#               edition that reordered by position could silently pair the
#               wrong face or title with the wrong person.
#   accent      None keeps the brand navy masthead. A dict overrides it —
#               Trident's teal is far too light for white text (about 1.3:1),
#               and Trident's own logo is navy-on-teal, so the masthead
#               inverts: teal ground, navy type. The value is the logo's own
#               background colour, sampled from the supplied artwork, so the
#               image sits on it without a seam.
#   noindex     The two editions share nearly all their text. Two indexable
#               near-copies is duplicate content and can suppress both, and
#               the NL hub only became indexable on 08/10/2026. Clubs reach
#               the Trident edition by Benny's link and the poster QR, so it
#               is kept out of the index by ruling.
EDITIONS = [
    {
        'key': 'nl',
        'slug': 'wellbeing-hub',
        'org': 'The National League',
        # The masthead wants the article; the sentence "across ... football"
        # does not. Two fields rather than one clever rule.
        'org_short': 'National League',
        'credit': 'Maintained by National League Safeguarding',
        'logo': '/assets/crests/National League rose white.png',
        'logo_fallback': '/assets/crests/National League rose.png',
        'logo_w': 58,
        'lead_first': 'Cannon',
        # The rose is a wordless badge, so the organisation has to be said in
        # type. The Trident logo IS the wordmark, so saying it again beside it
        # is the restated-label waffle the house rule cuts.
        'kicker': True,
        'accent': None,
        'noindex': False,
        'leagues': [],
    },
    {
        'key': 'trident',
        'slug': 'trident-wellbeing',
        'org': 'Trident Leagues',
        'org_short': 'Trident Leagues',
        'credit': 'Provided by National League Safeguarding',
        # Sampled from the supplied artwork, not eyeballed: the lockup's
        # background is #73f2f2 and its wordmark #14293b.
        'logo': '/assets/wellbeing/trident-lockup.png',
        'logo_fallback': '',
        'logo_w': 190,
        'lead_first': 'Watson',
        'kicker': False,
        'accent': {'bg': '#73f2f2', 'fg': '#14293b', 'muted': '#2d4a63'},
        'noindex': True,
        'leagues': [
            ('Isthmian League', '/assets/wellbeing/trident-isthmian.png'),
            ('Northern Premier League', '/assets/wellbeing/trident-npl.png'),
            ('Southern League', '/assets/wellbeing/trident-southern.png'),
        ],
    },
]


def out_path(ed, name):
    return os.path.join(REPO, ed['slug'], name)


def resolve(ed, html):
    """Resolve [[org]] / [[org_short]] tokens in the rendered output.

    Shared copy sometimes has to name the organisation — "The National League
    Wellbeing Hub provides..." — and on the Trident edition that sentence was
    simply wrong. The alternative is a second copy of the paragraph per
    edition, which is the thing this whole build exists to avoid.

    Substitution happens on the FINISHED HTML rather than on the loaded
    content, because several blocks of markup are built once at import time
    and would otherwise carry the unsubstituted text. Doing it last catches
    every path with one line.

    [[ ]] rather than {{ }} on purpose: the page templates are f-strings whose
    literal CSS and JS braces are written {{ }}, and reusing that delimiter
    would make the token indistinguishable from them by eye.

    The assert is the point. An unresolved token does not break a build — it
    ships as the literal text "[[org_short]]" on a live wellbeing page, which
    nobody would notice until a club did.
    """
    out = (html.replace('[[org_short]]', ed['org_short'])
               .replace('[[org]]', ed['org']))
    assert '[[' not in out, (
        'unresolved token in the %s edition near: %s'
        % (ed['key'], out[max(0, out.index('[[')) - 60:out.index('[[') + 60]))
    return out


def poster_accent_css(ed):
    """The poster's masthead, per edition. A SEPARATE STYLESHEET from the page.

    This was the bug: the lockup's width lived in the page's accent block, so
    on the poster it fell through to `.hd img { width: 44px }` — the NL rose's
    square-badge rule — and the Trident wordmark printed as an illegible
    44px teal stamp on a navy bar. Two stylesheets need two accent blocks.

    The bar inverts to teal with navy type for the same reason the page's
    does, and here there is a second reason: the supplied lockup has its teal
    background baked in with no alpha, so on a navy bar it reads as a sticker
    stuck to the masthead.

    55mm, inside the 65mm ceiling that the artwork's 842px sets at 300dpi.
    See poster_logo().
    """
    a = ed['accent']
    if not a:
        return ''
    return (
        '\n  /* ' + ed['org'] + ' masthead. Teal ground, navy type — the page\n'
        '     stylesheet does the same, and the supplied lockup carries its\n'
        '     own teal background with no alpha, so any other ground shows a\n'
        '     panel edge. 55mm keeps it inside the 300dpi ceiling the raster\n'
        '     imposes; see poster_logo(). */\n'
        '  .hd { background: ' + a['bg'] + '; color: ' + a['fg'] + '; }\n'
        # `.hd img` is one class plus one type selector and therefore
        # outranks a bare `.hd__lockup`, so the 44px square-badge rule
        # kept winning and the wordmark printed illegibly small. Third
        # time a selector in this project has quietly out-specified the
        # rule meant to override it; qualify it and say so.
        '  .hd img.hd__lockup { width: 55mm; height: auto; }\n'
    )


def brand_kicker(ed):
    """The organisation name above WELLBEING HUB, where the logo does not
    already say it. See the `kicker` note in EDITIONS."""
    if not ed['kicker']:
        return ''
    return '\n        <span class="hub-brand__k">%s</span>' % esc(ed['org'])


def poster_kicker(ed):
    if not ed['kicker']:
        return ''
    return '\n      <i>%s</i>' % esc(ed['org'])


def noindex_meta(ed):
    return ('\n  <meta name="robots" content="noindex">'
            if ed['noindex'] else '')


def brand_logo(ed):
    """The masthead logo.

    The NL rose keeps its fallback; the Trident lockup has none to fall back
    to, and an onerror pointing at a missing file is the infinite-retry
    flicker the brand guidance warns about.
    """
    if ed['logo_fallback']:
        return ('<img src="%s" alt=""\n           '
                'onerror="this.onerror=null;this.src=\'%s\'">'
                % (ed['logo'], ed['logo_fallback']))
    return '<img src="%s" alt="">' % ed['logo']


def poster_logo(ed):
    """Same artwork, sized for print.

    CAPPED AT 65mm, AND THAT IS A PHYSICAL CONSTRAINT RATHER THAN A CHOICE.
    There is no vector of the Trident lockup and there will not be one — the
    supplied artwork is 842px wide, which is 300dpi at 71mm. 65mm keeps a
    margin above that floor so the sheet prints sharp. Widen it and the logo
    softens.
    """
    if ed['key'] == 'nl':
        return ('<img src="%s" alt=""\n         '
                'onerror="this.onerror=null;this.src=\'%s\'">'
                % (ed['logo'], ed['logo_fallback']))
    return '<img class="hd__lockup" src="%s" alt="%s">' % (ed['logo'], esc(ed['org']))


def league_row(ed):
    """The constituent leagues, in the footer. Trident only.

    Their supplied artwork has a white background baked in and no alpha, so it
    can only sit on a light surface — which the footer is. They are not on the
    poster: that sheet is already dense, and three more rasters on it was not
    what was asked for.
    """
    if not ed['leagues']:
        return ''
    marks = '\n'.join(
        '    <img src="%s" alt="%s" loading="lazy" decoding="async">' % (src, esc(name))
        for name, src in ed['leagues'])
    names = ', '.join(esc(n) for n, _ in ed['leagues'][:-1])
    names += ' and ' + esc(ed['leagues'][-1][0])
    return ('  <div class="hub-leagues">\n'
            '    <span>Covering the %s</span>\n%s\n  </div>\n' % (names, marks))


def _nav_css(ed):
    """Both navs in the edition's colours — the desktop strip and the fixed
    bottom bar on a phone.

    URGENCY BECOMES A FILLED BLOCK, NOT A COLOUR, AND THAT IS THE WHOLE
    POINT OF THIS FUNCTION. Both navs are built light-on-dark: muted text on
    navy, the Urgent help item picked out in white. Invert them to teal and
    the text has to go dark — at which point the brand red and the brand navy
    sit 1.74:1 APART FROM EACH OTHER (1.08:1 against the muted step). On a
    teal bar a dark red label and a dark navy label are the same label, and
    "Urgent help" stops reading as urgent. Measured, not guessed.

    So on teal the urgent item is a solid red field with white type —
    unmistakable at a glance, and legible for somebody who cannot separate
    the two hues at all. This is the one place on the page where the
    semantic colour must win over the brand one.

    A hairline between the masthead and the nav, because two adjacent teal
    bands otherwise merge into one and the nav stops looking like a nav.
    """
    a = ed['accent']
    if not a:
        return ''
    return (
        '\n  /* Navs in ' + ed['org'] + ' colours. The urgent item is a filled\n'
        '     red block rather than red text: on teal, red and navy text are\n'
        '     1.74:1 apart and "Urgent help" would stop looking urgent.\n'
        '     See _nav_css(). */\n'
        '  .hub-nav {\n'
        '    background: ' + a['bg'] + '; border-top: 1px solid ' + a['fg'] + ';\n'
        '  }\n'
        '  .hub-nav a { color: ' + a['muted'] + '; }\n'
        '  .hub-nav a:hover {\n'
        '    color: ' + a['fg'] + '; border-bottom-color: ' + a['fg'] + ';\n'
        '  }\n'
        '  .hub-nav a.is-urgent {\n'
        '    background: var(--primary); color: var(--white);\n'
        '    border-radius: 6px 6px 0 0;\n'
        '  }\n'
        '  .hub-nav a.is-urgent:hover {\n'
        '    background: var(--primary-600); color: var(--white);\n'
        '    border-bottom-color: var(--primary-600);\n'
        '  }\n'
        '  .hub-bottom {\n'
        '    background: ' + a['bg'] + '; border-top-color: ' + a['fg'] + ';\n'
        '  }\n'
        '  .hub-bottom a { color: ' + a['muted'] + '; }\n'
        '  .hub-bottom a:hover { color: ' + a['fg'] + '; }\n'
        '  .hub-bottom a.is-urgent {\n'
        '    background: var(--primary); color: var(--white);\n'
        '  }\n'
        '  .hub-bottom a.is-urgent .hub-i { color: var(--white); }\n'
    )


def _footer_css(ed):
    """The footer as a second brand band, bookending the masthead.

    TWO THINGS HERE ARE MEASURED RATHER THAN CHOSEN.

    --text-muted (#5a6a82) on this teal is 4.11:1, which fails AA for body
    text. The footer carries real sentences, not decoration, so the muted
    colour is overridden to one that passes — #2d4a63 at 6.92:1. White would
    be 1.34:1, which is why nothing here is white.

    The three league marks have a white background baked into the artwork with
    no alpha, so on a teal ground they would read as white rectangles. Keying
    the white out is not available: the NPL logo is a football whose own
    panels ARE white, so a key would eat the artwork. Each mark therefore gets
    a deliberate white chip, which matches the topic glyph chips elsewhere on
    the page and reads as a design decision instead of a rendering fault.

    The band is full-bleed, so the max-width moves from the outer element to
    the inner one — and with it the bottom padding and its 780px override,
    because an unconditional `padding: 0` on the outer would otherwise cancel
    a media query that appears earlier in the sheet.
    """
    a = ed['accent']
    if not a:
        return ''
    return (
        '\n  /* Footer as a second ' + ed['org'] + ' band. Contrast figures and\n'
        '     the white chips are explained at _footer_css(). */\n'
        '  .hub-footer {\n'
        '    background: ' + a['bg'] + '; max-width: none; padding: 0;\n'
        '    margin: clamp(30px, 4vw, 48px) 0 0;\n'
        '  }\n'
        '  .hub-footer__in {\n'
        '    max-width: 1100px; margin: 0 auto;\n'
        '    padding: 26px clamp(16px, 2.5vw, 32px) 96px;\n'
        '    border-top: none;\n'
        '  }\n'
        '  @media (min-width: 780px) {\n'
        '    .hub-footer__in { padding-bottom: 40px; }\n'
        '  }\n'
        '  .hub-purpose strong,\n'
        '  .hub-poster strong { color: ' + a['fg'] + '; }\n'
        '  .hub-purpose .hub-i,\n'
        '  .hub-poster .hub-i { color: ' + a['fg'] + '; }\n'
        '  .hub-purpose p,\n'
        '  .hub-poster p,\n'
        '  .hub-foot { color: ' + a['muted'] + '; }\n'
        '  .hub-leagues { border-top-color: ' + a['muted'] + '; }\n'
        '  .hub-leagues span { color: ' + a['muted'] + '; }\n'
        '  .hub-leagues img {\n'
        '    background: var(--white); padding: 7px 10px; border-radius: 7px;\n'
        '  }\n'
    )


def accent_css(ed):
    """Per-edition masthead colours.

    Trident's teal is very light: white on it is about 1.3:1, nowhere near
    readable, and their own logo is navy-on-teal. So the masthead INVERTS
    rather than being recoloured — teal ground, navy type.

    The background is the logo artwork's own sampled colour, which is also why
    the logo is not keyed to transparency: keying an anti-aliased raster
    leaves a pale fringe on any other ground, and matching the ground exactly
    means there is no edge to see.

    Returned as literal CSS. It is interpolated into an f-string, so its
    braces are not re-parsed and do not need doubling.
    """
    a = ed['accent']
    if not a:
        return ''
    return (
        '\n  /* ' + ed['org'] + ' masthead — see accent_css() in '
        'scripts/build-wellbeing-hub.py.\n'
        '     Teal ground with navy type, inverting the brand navy masthead,\n'
        '     because white on this teal is about 1.3:1. */\n'
        '  .hub-top { background: ' + a['bg'] + '; color: ' + a['fg'] + '; }\n'
        '  .hub-brand__tag { color: ' + a['muted'] + '; }\n'
        # A wide wordmark, not a square badge. In CSS and not an inline
        # style, so the base sheet's 560px breakpoint still applies — an
        # inline width silently un-responsives the masthead, which is how
        # the NL logo stopped shrinking on a phone in the first pass.
        '  .hub-brand img { width: ' + str(ed['logo_w']) + 'px; height: auto; }\n'
        '  @media (max-width: 560px) {\n'
        '    .hub-brand img { width: 140px; }\n'
        '  }\n'
        '  .hub-leagues {\n'
        '    display: flex; flex-wrap: wrap; align-items: center; gap: 14px 22px;\n'
        '    margin: 18px 0 0; padding-top: 16px;\n'
        '    border-top: 1px solid var(--border);\n'
        '  }\n'
        '  .hub-leagues span {\n'
        '    font-size: var(--text-xs); font-weight: 700; color: var(--text-muted);\n'
        '    text-transform: uppercase; letter-spacing: 0.08em;\n'
        '    flex: 1 1 100%; margin: 0;\n'
        '  }\n'
        '  .hub-leagues img { height: 58px; width: auto; }\n'
        + _nav_css(ed)
        + _footer_css(ed)
    )


def leads_for(ed):
    """The two safeguarding leads, with this edition's own lead first."""
    people = list(d['safeguarding'])
    people.sort(key=lambda p: 0 if p['name'].endswith(ed['lead_first']) else 1)
    assert people[0]['name'].endswith(ed['lead_first']), \
        'no lead matching %r in content.json' % ed['lead_first']
    return people

# Topic order, with the one-line descriptor each card carries. "Helping someone
# else" joins the grid as a topic, which is where it belongs — it was a
# top-level choice competing with "Find help for myself", and that pairing made
# people classify themselves before they could read anything.
# id, card title, card description, sprite glyph, hue.
#
# The hue is the GLYPH's, not the card's — see the colour rule in the page
# header. Spread deliberately across the semantic palette so the grid reads as
# eight things rather than eight tiles; `crisis` takes the brand red because it
# is the one card whose whole treatment is urgent.
TOPICS = [
    ('mental-health',  'Looking after your mental health', 'Everyday wellbeing, and what helps',   'wellbeing', 'green'),
    ('stress-anxiety', 'Stress and anxiety',               'Worry, pressure, physical symptoms',   'pulse',     'amber'),
    ('depression',     'Depression and low mood',          'Persistent low mood and what to do',   'cloud',     'blue'),
    ('crisis',         'Suicidal thoughts and crisis',     'If you or someone else is not safe',   'hand',      'urgent'),
    ('sleep',          'Sleep and recovery',               'Rest, routine and recovery',           'moon',      'purple'),
    ('gambling',       'Gambling and betting harms',       'Betting, debt and getting out of it',  'dice',      'navy'),
    ('alcohol-drugs',  'Alcohol and drugs',                'Drinking, drugs and cutting down',     'pill',      'navy'),
    ('helping-someone','Helping someone else',             'Starting the conversation',            'chat',      'blue'),
]

# Which topics are the urgent ones. The CARD's treatment — border, title
# colour, hover — still says one thing only: how urgent.
URGENT = {'crisis'}


def esc(s):
    return H.escape(s or '', quote=False)


def icon(name, size='md'):
    return ('<svg class="icon icon--%s hub-i" aria-hidden="true">'
            '<use href="/assets/icons/sprites.svg#icon-%s"></use></svg>' % (size, name))


def ext(href):
    """External links open in a new tab and say so to a screen reader."""
    return ' target="_blank" rel="noopener noreferrer"' if href.startswith('http') else ''


# Every topic page is the same nine headings in the same order, so the reader
# meets them seven times over. A glyph on each gives the page landmarks to scan
# by, and the hue is doing a job: green is something to DO, amber is a
# threshold to check yourself against, red is an emergency. The rest stay navy
# so the three that matter are the three that stand out.
#
# `eye` finally earns its place here. It was rejected for the privacy block
# because there it meant "watched"; under "Signs to look out for" that is
# exactly the instruction.
HEAD_GLYPH = {
    'You may find this page helpful if…': ('info',    'navy'),
    'Why this matters':                   ('pulse',   'navy'),
    'Signs to look out for':              ('eye',     'navy'),
    'Things you can do today':            ('tick',    'green'),
    'When should I seek help?':           ('warning', 'amber'),
    'Support inside football':            ('shield',  'navy'),
    'Support outside football':           ('hand',    'navy'),
    'Where to get help':                  ('hand',    'navy'),
    'Further information':                ('link',    'navy'),
    'Immediate help':                     ('phone',   'urgent'),
    'Signs somebody may be struggling':   ('eye',     'navy'),
    'How to start the conversation':      ('chat',    'green'),
    'What not to do':                     ('warning', 'amber'),
}


def head_mark(heading):
    glyph, hue = HEAD_GLYPH.get(heading, ('', ''))
    if not glyph:
        return ''
    return '<span class="hub-hmark hub-hmark--%s">%s</span>' % (hue, icon(glyph, 'md'))


def resource_card(r):
    return ('  <a class="hub-res" href="%s"%s>\n'
            '    <span class="hub-chip hub-chip--navy">%s</span>\n'
            '    <span class="hub-res__t"><strong>%s</strong><span>%s</span></span>\n'
            '    <span class="hub-res__go">%s%s</span>\n'
            '  </a>' % (esc(r['href']), ext(r['href']), icon(r['glyph'], 'md'),
                        esc(r['title']), esc(r['body']), esc(r['cta']), icon('link', 'sm')))


def render_blocks(blocks, label=None):
    out = []
    if label:
        out.append('<p class="text-label hub-kicker">%s</p>' % esc(label))
    for b in blocks:
        if b['heading']:
            out.append('<h3>%s%s</h3>' % (head_mark(b['heading']), esc(b['heading'])))
        for p in b['paras']:
            # The resource panels put the link label in its own paragraph; those
            # are rendered as links below, so don't print them twice.
            if p.strip() in ('Open resource ↗', 'Watch video ▶'):
                continue
            out.append('<p>%s</p>' % p)
        if b['items']:
            out.append('<ul>%s</ul>' % ''.join('<li>%s</li>' % esc(i) for i in b['items']))
        links = [l for l in b['links'] if l['href'].startswith('http')]
        if links:
            out.append('<div class="hub-links">')
            for l in links:
                lab = l['label'].replace('Open resource ↗', '').replace('Watch video ▶', '').strip()
                if not lab:
                    continue
                out.append('<a class="hub-link" href="%s"%s>%s%s</a>'
                           % (esc(l['href']), ext(l['href']), esc(lab), icon('link', 'sm')))
            out.append('</div>')
    return '\n      '.join(out)


PANEL_TONE = {
    'football-panel': 'hub-panel--football',
    'action-panel':   'hub-panel--action',
    'seek-panel':     'hub-panel--seek',
    'danger-panel':   'hub-panel--danger',
    'helpful-panel':  'hub-panel--helpful',
    'support-panel':  '',
}


# Two resource cards that the prototype left ORPHANED — they sat after the
# crisis view's closing tag, outside any panel, so the first parse dropped them
# and the page shipped without the FA's toolkit or its video. Both belong to
# the crisis page; restored here against the id rather than by position, so a
# re-parse of the prototype cannot silently lose them again.
EXTRA_RESOURCES = {
    'crisis': [
        {'glyph': 'toolkit',
         'title': "The FA – ‘On Your Side’ suicide prevention toolkit",
         'body': 'Football and sport-specific guidance to help people spot warning '
                 'signs, start conversations and connect someone with support.',
         'href': 'https://www.thefa.com/news/2026/sep/10/suicide-prevention-toolkit',
         'cta': 'Open toolkit'},
        {'glyph': 'play',
         'title': 'The FA – Suicide Prevention video',
         'body': "Watch The FA’s suicide prevention video for football-specific "
                 'awareness and support.',
         'href': 'https://www.youtube.com/watch?v=AE8Q8TFOdJw',
         'cta': 'Watch video'},
    ],
}


# The shared "When should I seek help?" block is identical on all seven topic
# pages. On six of them it is right — two weeks is the standard threshold for
# a condition that builds. On the crisis page it contradicts the same page's
# own advice four blocks earlier ("Call 999 if there is immediate danger"), and
# the failure mode is specific: most people with suicidal thoughts do not read
# themselves as being in "immediate danger", so they skip that line, reach a
# heading literally titled "When should I seek help?", and find a two-week
# threshold. The page has told them to wait.
#
# Replaced on the crisis page ONLY, at the repository owner's direction
# (05/10/2026). Every other page keeps the block as Martyn wrote it.
CRISIS_SEEK_HELP = [
    'Now. Do not wait to see whether it passes.',
    'Do not wait until you are certain it is serious enough.',
    'If you are not safe, or not sure you are safe, use the emergency numbers below.',
    'If you are worried about somebody else, speak to them today.',
]


def crisis_overrides(vid, blocks):
    """Plain list in, plain list out. NOT a generator — an early `return
    blocks` inside one yields nothing at all, which would have silently
    emptied every panel on the other six pages."""
    if vid != 'crisis':
        return blocks
    out = []
    for b in blocks:
        if b['heading'] == 'When should I seek help?':
            b = dict(b, items=list(CRISIS_SEEK_HELP))
        out.append(b)
    return out


def review_stamp(p):
    """Rewrite the review line. The one content edit on this page, made at the
    repository owner's explicit direction (05/10/2026).

    The prototype read "Reviewed: August 2026 | Next scheduled review:
    September 2026" on all seven topic pages. By October that promise had
    already lapsed, and a lapsed review date on a health page is worse than no
    date at all — it tells a reader the content is overdue a check nobody has
    done. The forward promise goes; the stamp says when it was last reviewed
    and stops there.
    """
    if 'Next scheduled review' not in p:
        return p
    return '<strong>Reviewed:</strong> September 2026'


# The prototype carried a dedicated CALM block on the crisis page, directly
# under the hero — CALM is a suicide-prevention charity, so that is the one
# topic where they are not just another entry in a list of services. The
# rebuild dropped it; its copy was two of the fifteen strings the v1.5 diff
# flagged as missing. Restored verbatim, at the top of the page, on request.
#
# Crisis only. On every other topic CALM stays where it is, in the home view's
# "Need to talk now?" block alongside the other services.
CALM_CTA_VIEWS = {'crisis'}


def calm_cta(title, body, cta, extra=''):
    """The CALM block. One component, two placements, each with its own words.

    Home carries Martyn's general description; the crisis page carries the
    suicide-specific copy the prototype had there. The styling is shared so a
    change to CALM's presentation happens once — the alternative was two
    near-identical treatments that look alike today and diverge by Christmas.
    """
    return (
        '  <a class="hub-calmcta%s" href="%s" target="_blank" rel="noopener noreferrer">\n'
        '    <span class="hub-calmcta__mark">'
        '<img src="/assets/wellbeing/calm-logo.svg" alt="CALM" width="197" height="129" '
        'loading="lazy" decoding="async"></span>\n'
        '    <span class="hub-calmcta__t">\n'
        '      <strong>%s</strong>\n'
        '      <span>%s</span>\n'
        '    </span>\n'
        '    <span class="hub-calmcta__go">%s%s</span>\n'
        '  </a>' % (extra, esc(d['calm']['href']), esc(title), esc(body),
                   esc(cta), icon('link', 'sm')))


CALM_CRISIS = (
    'Talk to CALM',
    'Free, anonymous support and practical help for anyone struggling with life '
    'or affected by suicidal thoughts.',
    'Get support',
)


def render_view(vid, view, glyph, hue):
    parts = []
    parts.append('<section class="hub-view" id="%s">' % vid)
    parts.append('  <a class="btn btn--ghost btn--sm hub-back" href="#home">%sBack to all topics</a>'
                 % icon('back', 'sm'))
    parts.append('  <header class="hub-topic-head">')
    parts.append('    <div class="hub-topic-head__r">')
    parts.append('      <span class="hub-chip hub-chip--lg hub-chip--%s">%s</span>' % (hue, icon(glyph, 'lg')))
    parts.append('      <h2 class="text-display">%s</h2>' % esc(view['title']))
    parts.append('    </div>')
    parts.append('    <p class="hub-lede">%s</p>' % view['intro'])
    parts.append('  </header>')

    if vid in CALM_CTA_VIEWS:
        parts.append(calm_cta(*CALM_CRISIS))

    for p in view['panels']:
        tone = ''
        for k, v in PANEL_TONE.items():
            if k in p['kind']:
                tone = v
                break
        parts.append('  <section class="hub-panel %s">' % tone)
        parts.append('      ' + render_blocks(crisis_overrides(vid, p['blocks']), p.get('label')))
        parts.append('  </section>')

    for r in EXTRA_RESOURCES.get(vid, []):
        parts.append(resource_card(r))

    if view.get('remember'):
        parts.append('  <aside class="hub-remember">')
        parts.append('    <h3>%s</h3><p>%s</p>' % (esc(view['remember']['title']), view['remember']['body']))
        parts.append('  </aside>')

    if view.get('review'):
        parts.append('  <aside class="hub-review">')
        parts.append('    <strong>Professional review</strong>')
        for p in view['review']:
            parts.append('    <p>%s</p>' % review_stamp(p))
        parts.append('  </aside>')

    parts.append('  <a class="btn btn--ghost btn--sm hub-back" href="#home">%sBack to all topics</a>'
                 % icon('back', 'sm'))
    parts.append('</section>')
    return '\n'.join(parts)


views_html = '\n\n'.join(
    render_view(vid, d['views'][vid], glyph, hue)
    for vid, _, _, glyph, hue in TOPICS if vid in d['views'])

topic_cards = '\n'.join(
    '    <a class="hub-topic%s" href="#%s" data-find="%s">\n'
    '      <span class="hub-chip hub-chip--%s">%s</span>\n'
    '      <strong>%s</strong>\n'
    '      <span class="hub-topic__d">%s</span>\n'
    '      %s\n'
    '    </a>' % (
        ' hub-topic--urgent' if tid in URGENT else '', tid,
        esc((label + ' ' + desc).lower()),
        hue, icon(glyph, 'md'), esc(label), esc(desc), icon('forward', 'sm'))
    for tid, label, desc, glyph, hue in TOPICS)

quick = '\n'.join(
    '      <div class="hub-num"><strong>%s</strong><span>%s</span><small>%s</small></div>'
    % (esc(q['value']), esc(q['name']), esc(q['note'])) for q in d['quick'])

# Headshots, supplied 05/10/2026. Keyed by surname rather than by position so
# that re-ordering the two leads cannot silently swap their faces.
LEAD_PHOTOS = {
    'Cannon': '/assets/wellbeing/lead-cannon.jpg',
    'Watson': '/assets/wellbeing/lead-watson.jpg',
}


def lead_photo(name):
    for surname, src in LEAD_PHOTOS.items():
        if name.endswith(surname):
            return ('<img class="hub-lead__img" src="%s" alt="" width="420" height="420" '
                    'loading="lazy" decoding="async">' % src)
    return ''



# The route to support. Same five stages Martyn wrote, drawn as a flow.
#
# It was a numbered vertical list for one version and that was the wrong read:
# numbers promise an order you must follow, and the copy that used to sit under
# this heading said the opposite — most people do not go through every stage.
# An arrow chain says "these connect" without saying "do 1, then 2". The last
# stage is red because it is the only one that is an emergency.
home_resources = '\n'.join(resource_card(r) for r in EXTRA_RESOURCES['crisis'])

# Home gets the same component as the crisis page, in CALM's own colours,
# carrying Martyn's general description rather than the suicide-specific copy.
calm_home = calm_cta(d['calm']['title'], d['calm']['body'], 'Visit CALM',
                     extra=' hub-calmcta--inset')

steps = '\n'.join(
    '      <li><span class="hub-flow__t%s">%s</span>%s</li>'
    % (' is-last' if i == len(d['pathway']['steps']) - 1 else '',
       esc(step),
       '' if i == len(d['pathway']['steps']) - 1 else icon('forward', 'sm'))
    for i, step in enumerate(d['pathway']['steps']))


def page(ed):
    """One edition's index.html. Everything that varies is on `ed`."""
    return resolve(ed, _page(ed))


def _page(ed):
    leads = '\n'.join(
        '      <div class="hub-lead">%s<span class="hub-lead__t"><strong>%s</strong><span>%s</span>'
        '<a href="mailto:%s">%s%s</a></span></div>'
        % (lead_photo(p['name']), esc(p['name']), esc(p['role']),
           esc(p['email']), icon('email', 'sm'), esc(p['email']))
        for p in leads_for(ed))

    return f'''<!DOCTYPE html>
<!--
  NL Tools — Wellbeing Hub
  Version: v1.19 (08/10/2026)
  File: /wellbeing-hub/index.html

  A NON-GATED public page. No auth-guard, no nl-topbar, no Firebase, no RTDB —
  the club-contacts and /wellbeing/ precedent for public pages: brand tokens
  from /system/nl-brand.css, helpers from /system/nl-utils.js, everything else
  local.

  WHERE THE WORDS CAME FROM
  The copy is Martyn Cannon's, from the Wellbeing Hub prototype, reproduced
  verbatim. Only the shell around it is new. Content changes are a safeguarding
  decision and are not made here.

  WHAT THIS REPLACES
  The prototype was a single 2.9MB file: five stacked CSS override passes
  fighting each other with 483 !important declarations, two :root blocks, the
  header restyled four times, ~60 untokenised hex values, 110 fixed pixel font
  sizes, Inter instead of Carbona, 2MB of base64-embedded images, and every
  outbound link wrapped by Proofpoint's urldefense because the file had been
  through an inbox. None of that is here. All of the copy is.

  DESIGN CONTRACT — read before editing:
   1. No sign-in and no cookie. Anonymous topic counts ARE sent to GA4 — see
      the tag in the head for how and why. The privacy panel says "no personal
      details", which is the honest claim for anonymous counts; it does NOT
      say "nothing is recorded", which is what it said before the tag went in
      and would now be a lie. That panel and the tag are one change: if you
      start collecting anything that IS a personal detail — a client id, a
      search string, anything device-linked — the panel is wrong and must
      change in the same commit. A page that promises one thing and does another is worse than
      one that tracks openly, and this page is read by people in crisis.

      Still true, and still worth keeping: Carbona is served from
      /assets/fonts/ rather than Typekit, because a webfont CDN hands a third
      party the visitor's IP and referrer for no benefit to anyone. GA4 is a
      deliberate, named exception with a stated purpose; do not treat it as
      permission to add a font CDN, an embed or a second tracker.

      What is NEVER sent: anything the visitor typed, and anything at all to
      an advertising surface. Topic opens here are special-category health
      data under UK GDPR Art. 9.
   2. It must work without JavaScript. Routing is CSS :target. The search
      overlay is the only scripted feature and it is additive — without it the
      topics are all on screen anyway, which is why the button is hidden when
      scripting is off rather than left to do nothing.
   3. Colour is split in two, and the split is the whole rule. A CARD's
      treatment — its border, its title colour, its hover — says one thing
      only: how urgent. Red appears on exactly one card. The GLYPH CHIP
      carries category identity across the semantic palette, because eight
      identical navy tiles are a list pretending to be a grid. If you add a
      topic, give it a chip hue; never give a card one.
   4. Shared blocks are authored once.
   5. Glyphs come from /assets/icons/sprites.svg via NL.icon. Where the sprite
      has nothing honest to offer, the page uses no glyph rather than a
      misleading one. Three gaps are open and flagged as canon candidates: no
      padlock/shield (privacy), no home, and nothing at all for the seven
      mental-health topics, which is why the topic cards are typographic.

  INDEXABLE since 08/10/2026. It carried noindex while /wellbeing/ was live,
  because two public wellbeing sections competing in search results serves
  nobody. /wellbeing/ is now a redirect stub, so this is the only one and it
  should be findable — somebody searching "national league mental health"
  should land here rather than on nothing. poster.html keeps its noindex: a
  print sheet in search results is noise.

  CHANGELOG
  v1.19 (08/10/2026) — noindex removed: this is the live Wellbeing Hub.
    /wellbeing/ was retired the same day — "wellbeing can be nuked; the hub
    version is now the correct one" — and is a redirect stub pointing here
    with ?src=old-wellbeing, so arrivals from the old URL are countable. The
    two topics the old section had and this one does not, Burnout and Panic
    attacks, were raised before the removal and the hub was confirmed correct
    as it stands; the detail is in system/retired/wellbeing.md so a decision
    to add them later starts from the answered question.

  v1.18 (08/10/2026) — The GA4 tag is gone from this file and into canon at
    system/nl-analytics.js, which now loads on every page of nl.tools. It
    was written here first because this was the only page that wanted it;
    the second page asking is the repo's own signal to promote. Same
    property, same cookieless settings, so nothing about this page's
    behaviour or its privacy promise changes. The page keeps its own
    events — topic opens, helpline taps, search-used — and calls NL.track()
    rather than gtag directly. The reasoning that is specific to a wellbeing
    page (Art. 9, no banner, never send search text) stays here, above the
    script tag, because that is where somebody editing this page will look.

  v1.17 (08/10/2026) — THE POSTER IS NOW LINKED FROM THIS PAGE. It never was.
    Shipping it as a PDF yesterday fixed the file and left the route to it
    untouched: you had to know /wellbeing-hub/poster.html existed, open it,
    and then notice a grey sentence on it. So the one artefact meant for a
    dressing-room wall — where there is no phone to read this page on — was
    the only thing the site did not offer. User-reported: "surely we just
    include link to the pdf on the html?". A footer block, deliberately not
    the hero: pinning up a sheet is a club's job, not something to put in
    front of somebody who opened this page at 2am. Counted in GA4 as
    poster_download.

  v1.16 (08/10/2026) — One word. The footer disclaimer read "not a diagnosis",
    which on the poster landed two lines under "You do not need a diagnosis,
    or the right words" — the same word doing two different jobs in adjacent
    sentences, one reassuring and one disclaiming. The reassurance is the
    better sentence and is untouched; the disclaimer is now "not medical
    advice", which is plainer and covers more. Changed on both surfaces
    together, because a disclaimer worded two ways is two disclaimers.
    (Its antecedent went with it: "They do not replace a GP" had nothing to
    refer back to once "a diagnosis" left, so both now say "These pages".)

  v1.15 (08/10/2026) — The poster ships as a PDF. User-reported: "the ctrl p
    mangles it totally". It does — a browser print dialog defaults to
    background graphics OFF, adds its own header and footer, and fits to the
    printable area. My own earlier check was worthless: it used the renderer's
    default geometry, which IGNORES the @page margin, so I measured a layout
    no printer would produce. wellbeing-hub/poster.pdf is now rendered by
    scripts/render-wellbeing-poster.js with preferCSSPageSize and
    printBackground, and tests/poster-pdf.test.mjs fails the build if this
    HTML is committed newer than the PDF.

  v1.14 (08/10/2026) — GA4 switched on: G-NJQ0XQ0XCK. Its own GA4 account
    ("NL Tools"), deliberately not a second stream on the property the public
    site uses — fetch-ga-metrics.js reads that one by pagePath with no
    hostname filter, so sharing it would have put tool traffic into the file
    the Website Archive tool describes the website with. The placeholder arm
    of the guard is removed; it would have silently disabled the tag for
    anyone who set the id back. A measurement id is public by design and is
    not the GA_PROPERTY_ID secret.

  v1.13 (08/10/2026) — Poster trimmed:
    - The credit line is gone. The navy header band two inches above already
      says WELLBEING HUB / THE NATIONAL LEAGUE; repeating it in 10pt grey at
      the foot of the same sheet told the reader nothing they could not see.
      Kept on the web page, where the masthead scrolls away and the foot of a
      long page is genuinely a different place.
    - A 24mm mail glyph on the safeguarding contacts, inlined like the topic
      marks. Navy rather than the helplines' red: emailing a safeguarding
      inbox is a different act from ringing 999 and the sheet should not
      suggest otherwise.

  v1.12 (08/10/2026) — Shorter promise, and names off the poster:
    - The privacy panel was four sentences doing the work of two. "No sign-in
      and no personal details. Nobody at your club is told which pages you
      open." The cut clause explained how the counting works, which is our
      process, not the visitor's question. The club sentence stays: it answers
      the fear a player actually has.
    - POSTER: the safeguarding leads' names are off, at Martyn Cannon's
      request. The roles and the safeguarding@ ROLE inboxes stay, so the route
      is still reachable and the sheet outlives whoever holds the post — a web
      page is corrected in a minute, an A4 on a wall in 72 clubs is not.
    - POSTER: that space now carries the eight topic glyphs at 40px, inlined
      from the sprite rather than referenced, because a saved sheet printed
      off the network would otherwise show eight blank squares.
    - POSTER FIX: its lede still said "nothing you look at is recorded" — the
      page's panel was corrected when GA4 went in and the poster's was not, so
      the sheet was promising something the page no longer did.

  v1.11 (08/10/2026) — GA4, cookieless, at the League's request. The page
    previously promised "Nothing is recorded"; it now records anonymous topic
    counts, and the privacy panel says so in the visitor's own words. Those
    two changes are one change and must stay that way.
    client_storage:'none' means no cookie is written or read, which is what
    PECR reg. 6 governs — hence no consent banner, which on a page somebody
    opens in crisis is its own harm. Consent Mode is deliberately NOT denied:
    that degrades events to modelled pings and loses the per-topic counts.
    Every hash navigation is an event, because none of them produce a
    page_view on their own. Search TEXT is never sent — free text from a
    distressed visitor is not ours to collect; the events record that search
    was used and which of our own topics was chosen.
    Google Signals and ad personalisation are off: topic opens here are
    special-category health data under UK GDPR Art. 9.
    Inert until a measurement id is pasted in. The poster QR now carries
    ?src=poster so a scan is distinguishable from a typed address.

  v1.10 (06/10/2026) — One CALM block, used twice; new headshots:
    - The home CALM panel now carries CALM's own colours, like the crisis one.
      It is the SAME component, not a second one painted to match: calm_cta()
      takes its words as arguments, so home keeps Martyn's general description
      and crisis keeps the suicide-specific copy, while the presentation lives
      in one place. Two near-identical treatments look alike today and
      diverge by Christmas. .hub-calm and its styles are deleted.
    - New safeguarding photographs, cropped to the face. They render as 56px
      circles, where a wider frame is a photograph of a room with a person in
      it; both originals were 400px squares with the subject off-centre.

  v1.9 (06/10/2026) — Cards that read as cards, and arrival feedback:
    - White cards were nearly invisible. --border on --white over an
      --off-white page is a 4% luminance step, so a plain panel read as no
      card at all — four of the seven panels on every topic page are plain
      white. The edge moves to --navy-200, the stop canon nominates for
      borders. The FILL stays white deliberately: white is the neutral here,
      and tinting all seven would destroy the hierarchy the three tinted ones
      carry (navy-50 helpful, amber seek, red danger).
    - A navy ring is drawn round the destination for 1.6s after Topics or Who
      to call. Smooth scrolling answered "where did I go" but not "did
      anything happen", and tapping a nav item you were already on did
      nothing visible at all. An outline, not a background: both destinations
      already have backgrounds, and outline sits outside the box model so
      nothing reflows. Navy, not --primary: red means urgent on this page.
      Under prefers-reduced-motion the fade is zeroed by canon, leaving the
      ring appearing and vanishing with no animation — still a 1.6s
      highlight, which is the right degradation rather than no feedback.
    - #topics now wraps the heading AND the grid. It was on the heading row
      alone, so the anchor scrolled to a title with the cards it refers to
      below the fold, and there was no block to put a ring around.

  v1.8 (06/10/2026) — CALM, prominent on the crisis page. User-reported.
    CALM did not appear on that page at all — the only match for "calm" was
    the word "calmly" in a bullet. The prototype HAD a dedicated block there,
    directly under the hero, and the rebuild dropped it; its copy was two of
    the fifteen strings the v1.5 diff flagged as missing. Restored verbatim,
    in the same place.
    Crisis only. CALM is a suicide-prevention charity, so that is the one
    topic where they are not just another entry in a list of services;
    everywhere else they stay in the home view's "Need to talk now?" block.
    Carries CALM's own colours (#071a2e, #d7ff34) as tool-local custom
    properties, NOT brand tokens. Canon keeps one-off identity palettes
    local — the claudio personas and the club crest LUT are the precedent —
    and promoting a partner charity's lime green into the National League's
    palette would be claiming a colour that belongs to somebody else.

  v1.7 (05/10/2026) — Sticky nav, and the topic title beside its glyph:
    - The 48px nav strip sticks from 780px up. Topic pages run ~3.5 screens at
      that width, and somebody deep in one could not reach "Urgent help" or
      "Who to call" without scrolling back. The 105px masthead does NOT stick:
      spending 17% of the viewport to keep showing a logo already seen is not
      a trade worth making. Phones are excluded — the fixed bottom bar already
      carries these destinations, a sticky top would duplicate it and cost
      another 66px of an 844px screen, and it would collide with the HIDE PAGE
      tab, which sits at top:0 below that breakpoint.
    - scroll-margin-top moved with it: 0 by default, 64px inside the same
      media query that makes the nav sticky. These two numbers have to move
      together or the anchors land UNDER the bar — the bug v1.4 fixed. All
      eight journeys re-driven, desktop and phone.
    - Canon gotcha, worked around locally: `html, body {{ height: 100% }}` in
      nl-brand.css makes the body box one viewport tall however long the
      document is, and position:sticky can only stick inside its containing
      block. The nav unstuck itself at ~1100px and scrolled away. Overridden
      on this page rather than in canon — the rule is load-bearing for the
      full-height gate screens, and a lockstep change across 60 heads to fix
      one page is the wrong trade.
    - Topic title now sits beside its glyph rather than under it.

  v1.6 (05/10/2026) — The page foot, which had gone janky:
    - FIXED: "Reviewed: September 2026" broke onto two lines. The
      "Professional review" label added in v1.5 was styled as
      `.hub-review strong {{ display: block }}`, which also caught the inline
      <strong>Reviewed:</strong> inside the paragraph below it. Direct child
      only. Same class of bug as the chip glyphs in v1.1 — a descendant
      selector reaching further than intended.
    - The disclaimer and the credit line are one <footer> with one left edge
      and one rule above them. They were two loose blocks at different insets
      — the disclaimer pushed right by its icon's flex column, the credit line
      not — with nothing separating either from the page above.
    - The rule sits on the footer's inner element, so it starts where the text
      starts. On the padded outer box it overhung the content column by the
      horizontal padding at each end.
    - ~140px of dead space above the footer is gone. .hub-main reserved 112px
      to clear the fixed phone bottom bar, and the footer (which follows main)
      now carries that clearance itself, so the two were stacking.

  v1.5 (05/10/2026) — Masthead, route, and three things the rebuild had lost:
    - The FA's toolkit and video are on the HOME view as well as the crisis
      page. In the prototype both sat OUTSIDE every .view — orphaned between
      the crisis view's closing tag and the next view's opening one — so the
      prototype's display:none routing never hid them and they showed on every
      page. v1.1 restored them to the crisis page, where they are topically
      right, and that is exactly why they stopped appearing on home.
    - "What these pages are for — a route to the right support, not a
      diagnosis" is back. A health page without a not-a-diagnosis line is a
      real omission. Its prototype sibling, "Nothing here is recorded", stays
      dropped: .hub-privacy already covers that ground at the top of the page.
    - "Professional review" label restored above the sourcing note.
    - Masthead rebuilt as a lockup. It ran at --text-md with the second line
      in navy-200, which made the name of the site the quietest thing on it.
      Now the prototype's order — the League small above, WELLBEING HUB large
      below, tagline under that — all three in white, with size and weight
      doing the hierarchy instead of a washed-out tint. The tagline
      "Supporting you on and off the pitch" was also missing.
    - Route to support is an arrow chain, not a numbered list. Numbers promise
      an order you must follow, and the copy that used to sit under this
      heading said the opposite. Last stage red: it is the only emergency.
    - Tab reads HIDE PAGE.

  v1.4 (05/10/2026) — Navigation, scale and surfaces, all user-reported:
    - FIXED: "Topics" and "Who to call" did nothing. The hashchange handler
      scrolled to 0 on EVERY hash change, so the browser jumped to the anchor
      and the handler yanked it straight back. It now distinguishes a view
      (#crisis — replaces the page, start at the top) from an anchor on the
      home view (#topics, #numbers — land on that section), and waits a frame
      for the :target repaint, because coming from a topic page the home view
      is still display:none when the hash changes.
    - Type: off the small end of the ladder wherever the content is not fine
      print. The Hide control, the top nav, the urgent banner's line, the
      resource links and the review note were all a step too small. Nothing on
      this page has ever been a raw px value; this is about which token.
      --text-xs is now only kickers, the footer, "Free, 24/7" and the 5-up
      bottom bar, which is where canon's own .text-label sits.
    - Urgent banner: smaller (mark 40->30px, title to --text-base) and square
      on a phone. It wrapped into three ragged rows — mark alone, copy, then
      the button shoved right by margin-left:auto. Now a two-column grid.
    - Hide tab moved to the right edge, turned on its side. Below 780px it
      returns to a horizontal tab under the masthead: the side tab needs a
      gutter to live in, and a phone has none, so it sat on the body copy.
    - Search modal is the canon default width. It was size:'sm' — 440px, which
      is a prompt box, not a list of topics.
    - Coloured surfaces. The home view was six white cards on an off-white
      page, so nothing looked more important than anything else. Each section
      now sits on its own plate off the shade ladders — navy-50 for the route,
      primary-50 for the phone numbers, blue-light for safeguarding — with the
      cards inside kept white so they lift off it.
    - Dropped "Most people do not go through every stage. Start wherever fits."

  v1.3 (05/10/2026) — Scale and hierarchy, plus one safeguarding copy fix:
    - The crisis page no longer tells a reader to wait two weeks. "When should
      I seek help?" was one shared block across all seven topics; on six it is
      right, because two weeks is the standard threshold for something that
      builds. On the crisis page it contradicted that same page's own advice
      four blocks earlier, and the failure mode is specific: most people with
      suicidal thoughts do not read themselves as being in "immediate danger",
      so they skip that line, reach a heading titled "When should I seek
      help?", and find a two-week threshold. Crisis page only; the other six
      keep Martyn's wording. Made at the repository owner's direction.
    - Glyphs got bigger and are doing more work. Topic chips 44→54px (glyph
      24→30), topic-page chips 56→72px (glyph 30→40), the urgent banner's mark
      24→40px.
    - Every panel heading now carries a mark, and the hue sorts them: green is
      something to DO, amber is a threshold to measure yourself against, red
      is an emergency, navy is everything else. Seven pages of nine identical
      headings in identical order needed landmarks to scan by.
    - `eye` finally earns a place. It was rejected for the privacy block
      because there it means "watched"; under "Signs to look out for" that is
      the instruction.

  v1.2 (05/10/2026) — Review stamp. The seven topic pages promised a review in
    September 2026 that October had already overtaken. A lapsed date on a
    health page is worse than none: it tells the reader the content is overdue
    a check nobody has done. Now "Reviewed: September 2026", with no forward
    promise. Content change, made at the repository owner's direction.

  v1.1 (05/10/2026) — Second pass, all user-reported:
    - FIXED: the Home link did nothing when you were already on Home. #home is
      itself a .hub-view, so it matched the :target rule written to hide it.
      The routing rule now excludes it. Every other destination worked, which
      is why it survived a full screenshot pass.
    - The two FA resources the first parse dropped are back on the crisis
      page: the 'On Your Side' toolkit and the suicide-prevention video. They
      sat OUTSIDE any panel in the prototype — orphaned after a closing tag —
      so the structural parse never saw them.
    - Fifteen new glyphs in /assets/icons/sprites.svg (sheet v1.2). Topic
      cards and topic pages now carry one each. The gap this closes is the one
      v1.0 flagged and worked around.
    - Colour across the semantic palette, on the chips only. See the colour
      rule above — the card treatment still means urgency and nothing else.
    - Photographs: the hero beside the welcome copy, and the two safeguarding
      leads. Supplied by the League.
    - CALM's real mark, as SVG, on a navy plate. v1.0 shipped no logo rather
      than the photograph-of-a-screen the prototype carried.
    - 'Hide this page' is a fixed tab at the top of the viewport instead of a
      button in the masthead, so it does not scroll away from somebody who
      needs it halfway down a page.
    - Movement: smooth in-page scrolling, a 220ms entrance on a routed view,
      and a softened modal (the last is canon — nl-brand v2.70, not local).
      Canon's prefers-reduced-motion block cancels all three.

  v1.0 (05/10/2026) — Rebuilt from the prototype onto the canon.
-->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wellbeing Hub — {ed['org']}</title>
  <meta name="description" content="Information, practical advice and confidential support for players, staff and volunteers across {ed['org_short']} football.">{noindex_meta(ed)}
  <meta name="theme-color" content="#223b7c">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">

  <link rel="stylesheet" href="/system/nl-brand.css?v=67">
  <script src="/system/nl-utils.js?v=47"></script>
  <script src="/system/nl-analytics.js?v=1"></script>

  <!-- GA4 is canon now: system/nl-analytics.js, loaded above, carries the
       measurement id and the cookieless settings for every page on nl.tools.
       It was written inline here on 08/10/2026 and promoted the moment a
       second page wanted it.

       The reasoning that is SPECIFIC TO THIS PAGE, and which the canon file
       repeats because it governs the settings there:

       No cookie banner, because nothing is stored on or read from the
       device — that is what UK PECR reg. 6 governs. A banner on a page
       somebody opens in a crisis is its own harm.

       Topic opens here are special-category health data under UK GDPR
       Art. 9 — "this device opened the suicide page" — so Google Signals
       and ad personalisation are off in the canon file and must stay off.

       SEARCH TEXT IS NEVER SENT. People type free text into that box on a
       wellbeing page. The events below record that a search happened and
       which result was chosen, never what was typed. -->

  <style>
  /* Carbona, self-hosted — two reasons, and the first one changed on
     08/10/2026. It was "this page promises nothing is recorded", which is no
     longer true: GA4 loads above. What remains true is narrower and still
     worth it. A Typekit request hands Adobe the visitor's IP and referrer —
     the referrer being a URL like /wellbeing-hub/#crisis — and that is a
     second third party nobody asked for, on top of the one the League chose.
     Second, the poster and this page must render correctly from a machine
     that cannot reach Typekit. */
  @font-face {{
    font-family: 'carbona-hub';
    src: url('/assets/fonts/carbona-400.woff2') format('woff2');
    font-weight: 100 500; font-style: normal; font-display: swap;
  }}
  @font-face {{
    font-family: 'carbona-hub';
    src: url('/assets/fonts/carbona-700.woff2') format('woff2');
    font-weight: 501 800; font-style: normal; font-display: swap;
  }}
  @font-face {{
    font-family: 'carbona-hub';
    src: url('/assets/fonts/carbona-900.woff2') format('woff2');
    font-weight: 801 900; font-style: normal; font-display: swap;
  }}
  :root {{ --font: 'carbona-hub', ui-sans-serif, system-ui, -apple-system, sans-serif; }}

  /* Every in-page jump on this page is a link to an anchor, and a hard jump
     loses the reader's place — you arrive somewhere with no sense of whether
     you went up or down. Canon's reduced-motion block sets this back to auto
     with !important for anyone who has asked for less motion. */
  html {{ scroll-behavior: smooth; }}

  /* Canon sets `html, body {{ height: 100% }}`. That makes the body box one
     viewport tall however long the document is, and a position:sticky element
     can only stick inside its containing block — so the nav below unstuck
     itself at ~1100px and scrolled away. Measured, not guessed: navBottom
     went 48, 48, then -208.

     Overridden here rather than in canon. The rule is load-bearing for the
     full-height gate screens and nobody has audited what else leans on it; a
     lockstep change across 60 heads to fix one page's nav is the wrong trade.
     Worth recording as a canon gotcha: any tool that wants a sticky direct
     child of <body> will hit this and will not get an error, just a bar that
     quietly stops sticking a screen and a half down. */
  html, body {{ height: auto; min-height: 100%; }}

  body {{ background: var(--off-white); color: var(--text); margin: 0; }}

  /* ── Header ───────────────────────────────────────────────────────────── */
  .hub-top {{ background: var(--navy); color: var(--white); }}
  .hub-top__in {{
    max-width: 1100px; margin: 0 auto;
    padding: 14px clamp(16px, 2.5vw, 32px);
    display: flex; align-items: center; gap: 16px;
  }}
  /* The masthead is a lockup, not a label. It ran at --text-md with the
     second line in navy-200, which made the name of the site the quietest
     thing on the page. The order is the prototype's: the League small above,
     WELLBEING HUB large below, tagline under that — and all three in white,
     with size and weight doing the hierarchy rather than a washed-out tint. */
  .hub-brand {{ display: flex; align-items: center; gap: 16px; min-width: 0; }}
  .hub-brand img {{ width: 58px; height: 58px; object-fit: contain; flex: none; }}
  .hub-brand__t {{ min-width: 0; }}
  .hub-brand b {{
    display: block; font-size: var(--text-lg); font-weight: 900; line-height: 1.05;
    text-transform: uppercase; letter-spacing: var(--tracking-tight);
  }}
  .hub-brand__k {{
    display: block; font-size: var(--text-xs); font-weight: 800;
    text-transform: uppercase; letter-spacing: var(--tracking-wide);
    margin-bottom: 3px;
  }}
  .hub-brand__tag {{
    display: block; font-size: var(--text-sm); font-weight: 400;
    margin-top: 5px;
  }}
  @media (max-width: 560px) {{
    .hub-brand img {{ width: 44px; height: 44px; }}
    .hub-brand__tag {{ display: none; }}
  }}
  /* Leaves the page for a neutral site. A safeguarding feature, not a
     convenience — somebody may be reading this where they would rather not be
     seen reading it, and that is exactly why it is fixed to the viewport
     rather than sat in the masthead where it scrolls out of reach. Red, not
     navy: it is the only control on the page that is about the room you are
     in rather than the subject you are reading. */
  /* MOVED TO THE SIDE. At the top it competed with the masthead and forced
     the wordmark to shrink out of its way; on the right edge it is clear of
     everything, still reachable from any scroll position, and it reads as a
     way out of the page rather than a control within it. writing-mode turns
     the label on its side so the tab costs ~40px of width and no height.

     Not --text-xs any more. Canon reserves xs for kickers and fine print, and
     this is the most important control on the page. */
  .hub-exit {{
    position: fixed; right: 0; top: 50%; transform: translateY(-50%); z-index: 60;
    writing-mode: vertical-rl;
    font-family: var(--font); font-size: var(--text-sm); font-weight: 700;
    background: var(--primary); color: var(--white);
    border: 0; border-radius: var(--radius) 0 0 var(--radius);
    padding: 16px 11px; cursor: pointer;
    display: flex; align-items: center; gap: 9px;
    box-shadow: -2px 0 12px var(--navy-900);
  }}
  .hub-exit .hub-i {{ transform: rotate(90deg); }}
  @media (max-width: 779px) {{
    .hub-exit {{
      writing-mode: horizontal-tb; top: 0; transform: none;
      right: clamp(10px, 3vw, 24px);
      border-radius: 0 0 var(--radius) var(--radius);
      padding: 9px 13px 10px; box-shadow: 0 2px 10px var(--navy-900);
    }}
    .hub-exit .hub-i {{ transform: none; }}
    .hub-exit:hover {{ padding-left: 13px; padding-bottom: 13px; }}
    /* THE TAB GETS ITS OWN ROW, it does not share one with the brand.
       This read `padding-right: 92px`, a reserve for a tab that is actually
       137px wide — so it was 45px short from the day it was written, and the
       masthead title sat under the tab. Reported as "label hiding the
       header"; measured at 360-600px on both editions before changing
       anything.
       A bigger horizontal reserve cannot fix it. At 360px a 137px tab plus a
       24px offset plus the Trident edition's 140px wordmark plus the words
       WELLBEING HUB do not fit on one row, whatever the number is. So the
       masthead reserves VERTICAL space instead: the tab occupies a strip at
       the top right and the brand starts below it, full width.
       One number, and it is the tab's HEIGHT — which does not change with the
       label, the logo or the viewport, unlike its width. */
    .hub-top__in {{ padding-top: 52px; }}
  }}
  .hub-exit:hover {{ background: var(--primary-600); padding-left: 15px; }}
  .hub-exit:focus-visible {{ outline: none; box-shadow: var(--focus-ring); }}
  /* One element, not a bare text node beside a span: the button is a flex
     row, every text node in it becomes an anonymous flex item, and the 7px
     gap then lands between "Hide" and "this page". */
  .hub-exit__t {{ white-space: nowrap; text-transform: uppercase; letter-spacing: var(--tracking-wide); }}

  /* Desktop keeps the destinations in a bar under the header; the fixed strip
     along the bottom of the screen is a phone pattern and wastes 64px of a
     laptop viewport. */
  .hub-nav {{ display: none; background: var(--navy-600); }}
  .hub-nav ul {{
    max-width: 1100px; margin: 0 auto; padding: 0 clamp(16px, 2.5vw, 32px);
    display: flex; gap: 4px; list-style: none;
  }}
  .hub-nav a {{ font-size: var(--text-base);
    display: inline-flex; align-items: center; gap: 7px;
    padding: 11px 14px; color: var(--navy-100); text-decoration: none;
    font-size: var(--text-sm); font-weight: 700;
    border-bottom: 3px solid transparent;
  }}
  .hub-nav a:hover {{ color: var(--white); border-bottom-color: var(--navy-300); }}
  .hub-nav a.is-urgent {{ color: var(--white); }}

  .hub-main {{
    max-width: 1100px; margin: 0 auto;
    padding: clamp(20px, 3vw, 36px) clamp(16px, 2.5vw, 32px) 8px;
  }}

  /* ── Routing ──────────────────────────────────────────────────────────── */
  /* The whole site is one file; :target picks the view. Note the :not(#home)
     — without it, clicking "Home" made #home match .hub-view:target and the
     rule below hid the page it had just been asked to show. Reported as "the
     Home button fails when on home", and it did: every other destination
     worked, because every other destination is not also the fallback. */
  .hub-view {{ display: none; }}
  .hub-view:target {{ display: block; }}
  #home {{ display: block; }}
  body:has(.hub-view:target:not(#home)) #home {{ display: none; }}
  /* No offset by default: below 780px nothing is sticky, so an anchor should
     land flush with the top of the viewport. The desktop block below adds the
     offset at the same breakpoint that makes the nav sticky — these two
     numbers have to move together or Topics and Who to call land UNDERNEATH
     the bar, which is the bug v1.4 fixed. Verified by driving it. */
  .hub-view, #home, #topics, #numbers {{ scroll-margin-top: 0; }}

  /* Arriving, not cutting. A routed view swaps instantly because nothing
     moves — it is a display change, not a navigation — which on a page about
     crisis reads as a flinch. 220ms and 10px. Canon's file-wide
     prefers-reduced-motion block cancels it, along with the smooth scrolling
     declared on <html> above, for anyone who has asked their OS for less. */
  @keyframes hub-view-in {{
    from {{ opacity: 0; transform: translateY(10px); }}
    to   {{ opacity: 1; transform: none; }}
  }}
  .hub-view:target {{ animation: hub-view-in 220ms cubic-bezier(0.2, 0.8, 0.3, 1); }}

  /* ── Urgent banner ────────────────────────────────────────────────────── */
  .hub-urgent {{
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    background: var(--primary); color: var(--white);
    border-radius: var(--radius-lg); padding: 15px 18px; text-decoration: none;
  }}
  .hub-urgent:hover {{ background: var(--primary-600); }}
  .hub-urgent > .hub-i {{ width: 30px; height: 30px; }}
  .hub-urgent strong {{
    display: block; font-size: var(--text-base); font-weight: 900;
    text-transform: uppercase; letter-spacing: var(--tracking-tight);
  }}
  .hub-urgent span {{ display: block; font-size: var(--text-base); margin-top: 3px; }}
  .hub-urgent__go {{
    margin-left: auto; background: var(--white); color: var(--primary);
    font-size: var(--text-sm); font-weight: 900; border-radius: var(--radius-pill);
    padding: 10px 16px; white-space: nowrap;
  }}

  .hub-welcome {{
    padding: clamp(26px, 4vw, 40px) 0 4px;
    display: grid; gap: clamp(18px, 3vw, 32px); align-items: center;
  }}
  .hub-welcome__t {{ max-width: 620px; }}
  .hub-welcome h1 {{ margin: 0 0 12px; }}
  .hub-welcome p {{ margin: 0; }}
  /* The asset is 304px wide and is never stretched far past it — an upscaled
     photograph on a page asking to be trusted is a cheap tell. */
  .hub-welcome__img {{
    width: 100%; max-width: 380px; height: auto;
    border-radius: var(--radius-lg); display: block;
  }}
  @media (min-width: 900px) {{
    .hub-welcome {{ grid-template-columns: 1fr auto; }}
  }}

  /* ── Topic chips ──────────────────────────────────────────────────────── */
  /* The one place category colour lives. Tinted background, solid glyph; the
     card around it stays neutral so the only thing red means is urgent. */
  .hub-chip {{
    display: grid; place-items: center; flex: none;
    width: 54px; height: 54px; border-radius: 15px;
  }}
  .hub-chip .hub-i {{ width: 30px; height: 30px; }}
  .hub-chip--lg {{ width: 72px; height: 72px; border-radius: 20px; }}
  .hub-chip--lg .hub-i {{ width: 40px; height: 40px; }}
  .hub-chip--navy   {{ background: var(--navy-50);    color: var(--navy-600); }}
  .hub-chip--green  {{ background: var(--green-light); color: var(--green); }}
  .hub-chip--amber  {{ background: var(--amber-light); color: var(--amber-deep); }}
  .hub-chip--blue   {{ background: var(--blue-light);  color: var(--blue); }}
  .hub-chip--purple {{ background: var(--purple-light);color: var(--purple); }}
  .hub-chip--urgent {{ background: var(--primary-100); color: var(--primary); }}

  /* ── Heading marks ────────────────────────────────────────────────────── */
  /* Nine headings, in the same order, on seven pages. The glyph is what makes
     them scannable; the hue is what makes three of them louder than the other
     six — green to do, amber to check yourself against, red for an emergency. */
  .hub-panel h3 {{ display: flex; align-items: center; gap: 11px; }}
  .hub-hmark {{
    display: grid; place-items: center; flex: none;
    width: 34px; height: 34px; border-radius: 10px;
  }}
  .hub-hmark .hub-i {{ width: 20px; height: 20px; }}
  .hub-hmark--navy   {{ background: var(--navy-50);     color: var(--navy-600); }}
  .hub-hmark--green  {{ background: var(--green-light); color: var(--green); }}
  .hub-hmark--amber  {{ background: var(--amber-light); color: var(--amber-deep); }}
  .hub-hmark--urgent {{ background: var(--primary-100); color: var(--primary); }}
  /* Inside an already-tinted panel the plate would be a tint on a tint. */
  .hub-panel--seek .hub-hmark, .hub-panel--danger .hub-hmark {{ background: var(--white); }}

  /* ── CALM call to action (crisis page) ────────────────────────────────── */
  /* CALM's own colours, NOT brand tokens, and deliberately so. The canon's
     policy keeps genuine one-off identity palettes tool-local — the claudio
     personas and the club crest LUT are the precedent — and a partner
     charity's brand is exactly that. Promoting #d7ff34 to a token would put a
     lime green in the National League's palette that belongs to somebody else.

     Near-black rather than --navy because CALM's artwork is white-on-dark and
     this is their card, not ours; it also keeps it distinct from .hub-remember
     further down the same page, which is solid --navy. */
  .hub-calmcta {{
    --calm-ink: #071a2e;
    --calm-acid: #d7ff34;
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
    background: var(--calm-ink); color: var(--white);
    border-radius: var(--radius-lg); padding: 20px clamp(18px, 2.5vw, 24px);
    margin-top: 16px; max-width: 820px; text-decoration: none;
  }}
  .hub-calmcta__mark {{ flex: none; }}
  .hub-calmcta__mark img {{ display: block; width: 92px; height: auto; }}
  .hub-calmcta__t {{ flex: 1 1 260px; }}
  .hub-calmcta__t strong {{
    display: block; font-size: var(--text-md); font-weight: 900; line-height: 1.2;
  }}
  .hub-calmcta__t > span {{
    display: block; font-size: var(--text-sm); line-height: 1.5; margin-top: 5px;
  }}
  .hub-calmcta__go {{
    flex: none; display: inline-flex; align-items: center; gap: 7px;
    background: var(--calm-acid); color: var(--calm-ink);
    font-size: var(--text-sm); font-weight: 900;
    border-radius: var(--radius-pill); padding: 11px 18px;
  }}
  .hub-calmcta:hover .hub-calmcta__go {{ background: var(--white); }}
  /* Inside the already-bordered "Need to talk now?" box, so it loses the
     outer card's width cap and takes a separating rule above instead. */
  .hub-calmcta--inset {{ max-width: none; margin-top: 18px; }}

  /* ── Resource cards ───────────────────────────────────────────────────── */
  /* The FA's toolkit and video. Bigger than a "Further information" link
     because they are a destination, not a citation. */
  .hub-res {{
    display: flex; align-items: center; gap: 15px; flex-wrap: wrap;
    background: var(--white); border: 1px solid var(--navy-200);
    border-radius: var(--radius-lg); padding: 16px 18px; margin-top: 14px;
    text-decoration: none; color: inherit; max-width: 820px;
  }}
  .hub-res:hover {{ border-color: var(--navy); background: var(--navy-50); }}
  .hub-res__t {{ flex: 1 1 260px; }}
  .hub-res__t strong {{ display: block; font-size: var(--text-base); font-weight: 900; color: var(--navy); }}
  .hub-res__t span {{ display: block; font-size: var(--text-sm); color: var(--text-muted); margin-top: 3px; line-height: 1.45; }}
  .hub-res__go {{
    flex: none; display: inline-flex; align-items: center; gap: 6px;
    font-size: var(--text-sm); font-weight: 900; color: var(--primary);
  }}

  /* No glyph. The sprite's nearest candidate is `eye`, which says watched —
     the opposite of what this block promises. A navy rule carries the weight
     instead; see the canon note in the header about the missing padlock. */
  .hub-privacy {{
    background: var(--navy-50); border: 1px solid var(--navy-200);
    border-left: 3px solid var(--navy);
    border-radius: var(--radius-lg); padding: 15px 17px; margin: 22px 0 0;
  }}
  .hub-privacy strong {{ display: block; font-size: var(--text-base); font-weight: 900; }}
  .hub-privacy p {{ margin: 3px 0 0; }}

  /* ── Arrival highlight ────────────────────────────────────────────────── */
  /* Smooth scrolling solved "where did I go" but not "did anything happen" —
     landing at the top of a section that looks like the section you left is
     ambiguous, and tapping a nav item you are already at does nothing visible
     at all. A ring is drawn round the destination for 1.6s.
     Why an outline and not a background: the two destinations already have
     backgrounds (#numbers is --primary-50), so a tint would fight them, and
     outline is outside the box model so nothing reflows. outline-offset keeps
     it off the content without padding.
     Why navy and not --primary: red means urgent on this page. A navigation
     confirmation is not urgent.
     The fade lives on the BASE rule and the flashed state turns transition
     off, so the ring snaps on the instant you arrive and fades out when the
     class is removed. Under prefers-reduced-motion canon zeroes the duration,
     which leaves the ring appearing and vanishing with no fade — still a
     1.6s highlight, just not an animated one. That is the correct degradation
     rather than no feedback at all. */
  .hub-sect, #numbers {{
    border-radius: var(--radius-lg);
    transition: outline-color 700ms ease-out;
    outline: 3px solid transparent; outline-offset: 7px;
  }}
  .hub-sect.is-arrived, #numbers.is-arrived {{
    outline-color: var(--navy); transition: none;
  }}

  /* ── Section heads ────────────────────────────────────────────────────── */
  .hub-head {{
    display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap;
    margin: clamp(30px, 4vw, 44px) 0 4px;
  }}
  .hub-head h2 {{ margin: 0; }}
  .hub-head p {{ margin: 0; flex: 1 1 260px; }}
  .hub-find {{
    font-family: var(--font); font-size: var(--text-sm); font-weight: 700;
    background: var(--white); color: var(--navy);
    border: 1px solid var(--navy-200); border-radius: var(--radius);
    padding: 9px 14px; cursor: pointer; min-height: 40px;
    display: inline-flex; align-items: center; gap: 8px;
  }}
  .hub-find:hover {{ background: var(--navy-50); border-color: var(--navy); }}

  /* ── Topics ───────────────────────────────────────────────────────────── */
  .hub-topics {{
    display: grid; gap: 12px; margin-top: 16px;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  }}
  .hub-topic {{
    display: flex; flex-direction: column; gap: 4px;
    background: var(--white); border: 1px solid var(--navy-200);
    border-radius: var(--radius-lg); padding: 18px 18px 16px;
    text-decoration: none; color: var(--text); min-height: 108px;
  }}
  .hub-topic .hub-chip {{ margin-bottom: 10px; }}
  .hub-topic:hover {{ border-color: var(--navy); background: var(--navy-50); }}
  .hub-topic strong {{ font-size: var(--text-md); font-weight: 900; line-height: 1.25; }}
  .hub-topic__d {{ font-size: var(--text-sm); color: var(--text-muted); line-height: 1.45; }}
  /* Direct child only. `.hub-topic .hub-i` also matched the glyph inside the
     chip — same specificity, later in source — so every chip's colour was
     quietly repainted navy-400 and the whole palette came out washed. */
  .hub-topic > .hub-i {{ margin-top: auto; align-self: flex-end; color: var(--navy-400); }}
  .hub-topic--urgent {{ border-color: var(--primary-200); }}
  .hub-topic--urgent strong {{ color: var(--primary); }}
  .hub-topic--urgent:hover {{ border-color: var(--primary); background: var(--primary-50); }}

  /* ── Route to support ─────────────────────────────────────────────────── */
  /* The home view was six white cards on an off-white page, which gave it no
     rhythm — everything looked equally important because everything looked
     the same. Each big section now sits on its own tinted plate, taken off
     the shade ladders (50/100 for surfaces, 200 for borders, per canon's own
     note). The cards INSIDE each plate stay white, so they lift off it. */
  .hub-route {{
    background: var(--navy-50); border: 1px solid var(--navy-200);
    border-radius: var(--radius-lg); padding: 22px clamp(18px, 2.5vw, 26px);
    margin-top: clamp(30px, 4vw, 44px);
  }}
  .hub-route h2 {{ margin: 0 0 4px; }}
  .hub-route > p {{ margin: 0 0 20px; }}
  .hub-flow {{
    list-style: none; margin: 14px 0 0; padding: 0;
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  }}
  .hub-flow li {{ display: flex; align-items: center; gap: 10px; }}
  .hub-flow .hub-i {{ flex: none; color: var(--navy-400); }}
  .hub-flow__t {{
    background: var(--white); border: 1px solid var(--navy-200);
    border-radius: var(--radius-pill); padding: 10px 17px;
    font-size: var(--text-base); font-weight: 700; color: var(--navy);
  }}
  .hub-flow__t.is-last {{
    background: var(--primary); border-color: var(--primary); color: var(--white);
  }}
  /* On a phone the chain stacks and the arrows turn to point down it. */
  @media (max-width: 620px) {{
    .hub-flow, .hub-flow li {{ flex-direction: column; align-items: stretch; }}
    .hub-flow li {{ gap: 6px; }}
    .hub-flow__t {{ text-align: center; }}
    .hub-flow .hub-i {{ transform: rotate(90deg); align-self: center; }}
  }}

  /* ── Numbers, CALM, safeguarding ──────────────────────────────────────── */
  .hub-box {{
    background: var(--blue-light); border: 1px solid var(--navy-200);
    border-radius: var(--radius-lg); padding: 22px clamp(18px, 2.5vw, 26px);
    margin-top: clamp(30px, 4vw, 44px);
  }}
  .hub-box h2 {{ margin: 0 0 4px; }}
  .hub-box > p {{ margin: 0; }}
  #numbers {{ background: var(--primary-50); border-color: var(--primary-200); }}
  .hub-nums {{
    display: grid; gap: 10px; margin-top: 18px;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  }}
  .hub-num {{
    background: var(--white);
    border: 1px solid var(--primary-200); border-radius: var(--radius);
    padding: 14px 15px;
  }}
  .hub-num strong {{
    display: block; font-size: var(--text-lg); font-weight: 900; color: var(--primary);
  }}
  .hub-num span {{ display: block; font-size: var(--text-sm); font-weight: 700; margin-top: 2px; }}
  .hub-num small {{ display: block; font-size: var(--text-xs); color: var(--text-muted); margin-top: 3px; }}


  .hub-leads {{
    display: grid; gap: 12px; margin-top: 16px;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }}
  .hub-lead {{
    display: flex; align-items: flex-start; gap: 14px;
    background: var(--white);
    border: 1px solid var(--navy-200); border-radius: var(--radius); padding: 14px 15px;
  }}
  .hub-lead__img {{
    flex: none; width: 56px; height: 56px; border-radius: 50%;
    object-fit: cover; background: var(--navy-50);
  }}
  .hub-lead__t {{ min-width: 0; }}
  .hub-lead strong {{ display: block; font-size: var(--text-base); font-weight: 900; }}
  .hub-lead__t > span {{
    display: block; font-size: var(--text-sm); color: var(--text-muted); margin: 2px 0 7px;
  }}
  .hub-lead a {{
    display: inline-flex; align-items: center; gap: 6px; word-break: break-word;
    font-size: var(--text-sm); font-weight: 700; color: var(--navy);
    text-decoration: underline; text-underline-offset: 2px;
  }}

  /* ── Topic pages ──────────────────────────────────────────────────────── */
  .hub-back {{ margin: 0 0 18px; }}
  .hub-topic-head {{ max-width: 760px; margin-bottom: 8px; }}
  /* Glyph beside the title rather than stacked above it — the two belong to
     each other, and stacking pushed the lede a chip's height down the page. */
  .hub-topic-head__r {{
    display: flex; align-items: center; gap: 18px; margin-bottom: 12px;
  }}
  .hub-topic-head h2 {{ margin: 0; }}
  @media (max-width: 560px) {{
    .hub-topic-head__r {{ gap: 13px; }}
    .hub-topic-head .hub-chip--lg {{ width: 56px; height: 56px; border-radius: 16px; }}
    .hub-topic-head .hub-chip--lg .hub-i {{ width: 32px; height: 32px; }}
  }}
  .hub-lede {{ margin: 0; font-size: var(--text-md); line-height: 1.55; color: var(--text-muted); }}

  /* --border (#dde3ed) on --white over an --off-white (#f4f6f9) page is a 4%
     luminance step: the card and the page are very nearly the same colour, so
     a plain panel reads as no card at all. The fill stays white — white IS the
     neutral here, and tinting all seven panels would destroy the hierarchy the
     three tinted ones carry — but the edge moves to --navy-200, which is the
     ladder stop canon nominates for borders. */
  .hub-panel {{
    background: var(--white); border: 1px solid var(--navy-200);
    border-radius: var(--radius-lg); padding: 20px clamp(18px, 2.5vw, 24px);
    margin-top: 14px; max-width: 820px;
  }}
  .hub-panel h3 {{
    margin: 0 0 10px; font-size: var(--text-md); font-weight: 900; color: var(--navy);
  }}
  .hub-panel h3 ~ h3 {{ margin-top: 20px; }}
  .hub-panel p {{ margin: 0 0 10px; font-size: var(--text-base); line-height: 1.6; }}
  .hub-panel p:last-child {{ margin-bottom: 0; }}
  .hub-panel ul {{ margin: 0 0 10px; padding-left: 22px; }}
  .hub-panel li {{ font-size: var(--text-base); line-height: 1.55; margin-bottom: 6px; }}
  .hub-panel ul:last-child {{ margin-bottom: 0; }}
  .hub-kicker {{ margin: 0 0 8px; }}

  /* Tone, by how urgent the panel is — not by what kind of panel it is. */
  .hub-panel--helpful {{ background: var(--navy-50); }}
  .hub-panel--football h3 {{ color: var(--navy-700); }}
  .hub-panel--action h3 {{ color: var(--green); }}
  .hub-panel--seek {{ background: var(--amber-light); border-color: var(--amber); }}
  .hub-panel--seek h3 {{ color: var(--amber-deep); }}
  .hub-panel--danger {{ background: var(--red-light); border-color: var(--red); }}
  .hub-panel--danger h3 {{ color: var(--red-deep); }}

  .hub-links {{ display: grid; gap: 8px; }}
  .hub-link {{
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    border: 1px solid var(--navy-200); border-radius: var(--radius);
    padding: 13px 15px; text-decoration: none; color: var(--navy);
    font-size: var(--text-base); font-weight: 700;
  }}
  .hub-link:hover {{ background: var(--navy-50); border-color: var(--navy); }}
  .hub-link .hub-i {{ flex: none; color: var(--navy-400); }}

  .hub-remember {{
    background: var(--navy); color: var(--white);
    border-radius: var(--radius-lg); padding: 20px clamp(18px, 2.5vw, 24px);
    margin-top: 14px; max-width: 820px;
  }}
  .hub-remember h3 {{ margin: 0 0 8px; font-size: var(--text-md); font-weight: 900; }}
  .hub-remember p {{ margin: 0; font-size: var(--text-base); line-height: 1.6; color: var(--navy-100); }}

  .hub-review {{
    margin-top: 14px; max-width: 820px; padding: 16px 18px;
    background: var(--navy-50); border-radius: var(--radius);
  }}
  /* Direct child. `.hub-review strong` also matched the inline
     <strong>Reviewed:</strong> inside the paragraph below and made it a
     block, so the date dropped onto its own line. */
  .hub-review > strong {{
    display: block; font-size: var(--text-sm); font-weight: 900;
    color: var(--navy); margin-bottom: 6px;
  }}
  .hub-review p {{
    margin: 0 0 6px; font-size: var(--text-sm); line-height: 1.55; color: var(--text-muted);
  }}
  .hub-review p:last-child {{ margin-bottom: 0; }}

  /* ── Search overlay ───────────────────────────────────────────────────── */
  .hub-find-list {{ display: grid; gap: 8px; margin-top: 12px; max-height: 46vh; overflow-y: auto; }}
  .hub-find-list a {{
    display: block; border: 1px solid var(--border); border-radius: var(--radius);
    padding: 12px 14px; text-decoration: none; color: var(--text);
  }}
  .hub-find-list a:hover {{ background: var(--navy-50); border-color: var(--navy); }}
  .hub-find-list strong {{ display: block; font-size: var(--text-base); font-weight: 900; }}
  .hub-find-list span {{ display: block; font-size: var(--text-sm); color: var(--text-muted); }}
  .hub-find-none {{ font-size: var(--text-sm); color: var(--text-muted); margin: 14px 0 0; }}

  /* ── Bottom bar — phones only ─────────────────────────────────────────── */
  .hub-bottom {{
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
    background: var(--navy); display: flex;
    padding-bottom: env(safe-area-inset-bottom);
    border-top: 1px solid var(--navy-600);
  }}
  .hub-bottom a {{
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 9px 2px; color: var(--navy-100); text-decoration: none;
    font-size: var(--text-xs); font-weight: 700; min-height: 56px;
    white-space: nowrap;
  }}
  .hub-bottom a:hover {{ color: var(--white); }}
  .hub-bottom a.is-urgent {{ color: var(--white); }}
  .hub-bottom a.is-urgent .hub-i {{ color: var(--primary-200); }}

  .hub-box--res .hub-res {{ max-width: none; border-color: var(--navy-200); }}

  /* ── Footer ───────────────────────────────────────────────────────────── */
  /* One block, one left edge, one rule above it. The disclaimer and the
     credit line used to be two loose elements with different insets — the
     disclaimer's text was pushed right by the icon's flex column and the
     credit line was not — and nothing separated either from the page above.
     The bottom padding clears the phone bottom bar, which is fixed and would
     otherwise sit on the last line. */
  /* The rule sits on the INNER element so it starts where the text starts.
     On the padded outer box it ran the full 1100px and overhung the content
     column by the horizontal padding at each end. */
  .hub-footer {{
    max-width: 1100px; margin: clamp(30px, 4vw, 48px) auto 0;
    padding: 0 clamp(16px, 2.5vw, 32px) 96px;
  }}
  .hub-footer__in {{ border-top: 1px solid var(--border); padding-top: 20px; }}
  .hub-purpose strong,
  .hub-poster strong {{
    display: flex; align-items: center; gap: 9px;
    font-size: var(--text-sm); font-weight: 900; color: var(--navy);
  }}
  .hub-purpose .hub-i,
  .hub-poster .hub-i {{ flex: none; color: var(--navy-400); }}
  .hub-purpose p {{
    margin: 7px 0 0; max-width: 72ch;
    font-size: var(--text-sm); line-height: 1.55; color: var(--text-muted);
  }}
  .hub-foot {{
    margin: 18px 0 0;
    font-size: var(--text-xs); color: var(--text-muted);
  }}
  /* The poster was reachable only by typing its URL, and the PDF only by
     finding the link on that page. So the single artefact meant to be pinned
     up where there is no phone signal was the one thing the site did not
     offer. It sits in the footer rather than the hero on purpose: pinning up
     a sheet is a club's job, not something to put in front of somebody who
     opened this page at 2am. */
  .hub-poster {{ margin: 20px 0 0; }}
  .hub-poster p {{
    margin: 7px 0 11px; max-width: 72ch;
    font-size: var(--text-sm); line-height: 1.55; color: var(--text-muted);
  }}
  @media (min-width: 780px) {{ .hub-footer {{ padding-bottom: 40px; }} }}

  /* On a phone the banner wrapped into three ragged rows — mark alone on the
     first, copy on the second, and the button shoved to the right edge by its
     margin-left:auto. A two-column grid puts the mark beside the title and
     stacks the rest under it, left-aligned with everything else. */
  @media (max-width: 560px) {{
    .hub-urgent {{
      display: grid; grid-template-columns: auto 1fr;
      gap: 4px 12px; align-items: start;
    }}
    .hub-urgent > .hub-i {{ grid-column: 1; grid-row: 1; margin-top: 1px; }}
    .hub-urgent > span {{ grid-column: 2; }}
    .hub-urgent__go {{ margin-left: 0; justify-self: start; margin-top: 10px; }}
  }}

  /* On a 390px phone the wordmark wraps mid-phrase and crowds "Hide this
     page", which is the one control here that has to stay obvious. Shrink the
     lockup rather than let it push the button about. */
  @media (max-width: 430px) {{
    .hub-top__in {{ gap: 10px; }}
    .hub-brand img {{ width: 34px; height: 34px; }}
    .hub-brand b {{ font-size: var(--text-base); }}
  }}

  @media (min-width: 780px) {{
    /* Topic pages run ~3.5 screens at this width. Someone deep in one cannot
       reach "Urgent help" or "Who to call" without scrolling back, and on
       this page of all pages that is the wrong thing to make them do. The
       48px strip sticks; the 105px masthead does not — spending 17% of the
       viewport to keep showing a logo they have already seen is not a trade
       worth making. Phones are excluded entirely: the fixed bottom bar
       already carries these destinations, and a sticky top would duplicate
       it, cost another 66px of an 844px screen, and collide with the HIDE
       PAGE tab, which sits at top: 0 below this breakpoint. */
    .hub-nav {{ display: block; position: sticky; top: 0; z-index: 50; }}
    .hub-view, #home, #topics, #numbers {{ scroll-margin-top: 64px; }}
    .hub-bottom {{ display: none; }}
  }}

  @media print {{
    .hub-nav, .hub-bottom, .hub-exit, .hub-find {{ display: none !important; }}
    .hub-view {{ display: block !important; page-break-before: always; }}
  }}{accent_css(ed)}
  </style>
</head>
<body>

<header class="hub-top">
  <div class="hub-top__in">
    <a class="hub-brand" href="#home" style="text-decoration:none;color:inherit">
      {brand_logo(ed)}
      <span class="hub-brand__t">{brand_kicker(ed)}
        <b>Wellbeing Hub</b>
        <span class="hub-brand__tag">Supporting you on and off the pitch</span>
      </span>
    </a>
  </div>
</header>

<!-- Pulled out of the header and onto the viewport edge. It was a button in
     the masthead, which meant it scrolled away — and the moment somebody
     actually needs it is the moment they have read half a page, not the moment
     they arrived. As a fixed tab it is reachable from anywhere, and the tab
     shape reads as "way out" rather than as one more control in the bar. -->
<button class="hub-exit" id="hubExit" type="button">{icon('close', 'sm')}<span class="hub-exit__t">Hide page</span></button>

<nav class="hub-nav" aria-label="Wellbeing Hub">
  <ul>
    <li><a href="#home">{icon('home', 'sm')}Home</a></li>
    <li><a href="#topics">{icon('wellbeing', 'sm')}Topics</a></li>
    <li><a class="is-urgent" href="#crisis">{icon('warning', 'sm')}Urgent help</a></li>
    <li><a href="#numbers">{icon('phone', 'sm')}Who to call</a></li>
    <li><a href="https://thefa.pagetiger.com/welfare-directory-guide" target="_blank" rel="noopener noreferrer">{icon('link', 'sm')}FA directory</a></li>
  </ul>
</nav>

<main class="hub-main">

<section class="hub-view" id="home">

  <a class="hub-urgent" href="#crisis">
    {icon('warning', 'lg')}
    <span>
      <strong>Urgent help</strong>
      <span>{esc(d['urgent'])}</span>
    </span>
    <span class="hub-urgent__go">Get help now</span>
  </a>

  <div class="hub-welcome">
    <div class="hub-welcome__t">
      <h1 class="text-display">{esc(d['welcome']['h1'])}</h1>
      <p class="text-body">{d['welcome']['body']}</p>
    </div>
    <!-- Decorative, and alt="" on purpose: it carries no information a screen
         reader is missing, and describing it would make a reader in distress
         sit through a description of a man alone on a pitch.

         CROPPED, not as supplied. The file handed over was a screen capture of
         the prototype's hero, so it had the prototype's own headline burnt
         into the pixels — "...and on the pitch." across the top and a red
         fragment down the left — plus one rounded card corner. 304px is the
         whole of what is left, and it is never stretched past it. -->
    <img class="hub-welcome__img" src="/assets/wellbeing/hero-pitch.jpg" alt=""
         width="304" height="261" decoding="async">
  </div>

  <div class="hub-privacy">
    <div>
      <strong>{esc(d['privacy']['title'])}</strong>
      <!-- Two sentences, and both earn their place. "No personal details" is the
           accurate claim now that anonymous topic counts are collected — the old
           "Nothing is recorded" became false the moment GA4 went in, and a
           four-sentence explanation of how the counting works answered a question
           nobody standing on this page is asking. The club sentence stays because
           it answers the fear a player actually has: not whether this is
           GDPR-compliant, but whether their club will find out.

           The full account of what is and is not collected lives in the design
           contract at the top of this file, where whoever changes the tag will
           read it. Short promise to the visitor, complete detail for the
           maintainer — not a privacy policy pasted into a wellbeing page. -->
      <p class="text-secondary">No sign-in and no personal details. Nobody at your club
        is told which pages you open.</p>
    </div>
  </div>

  <section class="hub-sect" id="topics">
  <div class="hub-head">
    <h2 class="text-heading">Explore topics</h2>
    <p class="text-secondary">Choose a topic to understand the concern, take practical steps and find support.</p>
    <button class="hub-find" id="hubFind" type="button" hidden>{icon('search', 'sm')}Search topics</button>
  </div>

  <div class="hub-topics">
{topic_cards}
  </div>
  </section>

  <section class="hub-route">
    <h2 class="text-heading">{esc(d['pathway']['title'])}</h2>
    <ol class="hub-flow">
{steps}
    </ol>
  </section>

  <section class="hub-box" id="numbers">
    <h2 class="text-heading">Need to talk now?</h2>
    <p class="text-secondary">Support is available.</p>
    <div class="hub-nums">
{quick}
    </div>

    <!-- CALM's own mark, supplied as SVG 05/10/2026. The prototype carried a
         photograph of it off a screen, which is why v1.0 shipped the name and
         the link with no logo at all rather than a degraded copy of somebody
         else's trademark. The artwork is white-on-dark, so it sits on navy. -->
{calm_home}
  </section>

  <section class="hub-box hub-box--res">
    <h2 class="text-heading">From The FA</h2>
    <p class="text-secondary">Football-specific guidance on spotting the signs and starting a conversation.</p>
{home_resources}
  </section>

  <section class="hub-box">
    <h2 class="text-heading">Worried about a child, or an adult at risk?</h2>
    <div class="hub-leads">
{leads}
    </div>
    <p class="text-secondary" style="margin-top:14px">{esc(d['safeguarding_note'])}</p>
  </section>

</section>

{views_html}

</main>

<nav class="hub-bottom" aria-label="Wellbeing Hub">
  <a href="#home">{icon('home', 'sm')}Home</a>
  <a href="#topics">{icon('wellbeing', 'sm')}Topics</a>
  <a class="is-urgent" href="#crisis">{icon('warning', 'sm')}Urgent help</a>
  <a href="#numbers">{icon('phone', 'sm')}Who to call</a>
  <a href="https://thefa.pagetiger.com/welfare-directory-guide" target="_blank" rel="noopener noreferrer">{icon('link', 'sm')}Directory</a>
</nav>

<footer class="hub-footer">
 <div class="hub-footer__in">
  <div class="hub-purpose">
    <strong>{icon('info', 'sm')}What these pages are for</strong>
    <p>A route to the right support, not medical advice. These pages do not replace a GP, clinician or your club’s medical staff.</p>
  </div>
  <div class="hub-poster">
    <strong>{icon('download', 'sm')}Poster for the dressing room</strong>
    <p>A4 sheet: the helplines, the safeguarding inboxes and a QR code back to these pages.</p>
    <a class="btn btn--navy btn--sm" href="/{ed['slug']}/poster.pdf" download>Download the poster (PDF)</a>
  </div>
{league_row(ed)}  <p class="hub-foot">{esc(ed['org'])} · Wellbeing Hub · {esc(ed['credit'])}</p>
 </div>
</footer>

<script>
/* Enhancement only. Everything above works with this absent: routing is CSS
   :target, and the search button stays hidden unless this runs — an overlay
   that filters a list is no use when the whole list is already on screen. */
(function () {{
  'use strict';

  var TOPICS = [].slice.call(document.querySelectorAll('.hub-topic')).map(function (a) {{
    return {{
      href: a.getAttribute('href'),
      find: a.getAttribute('data-find') || '',
      label: a.querySelector('strong').textContent,
      desc: a.querySelector('.hub-topic__d').textContent
    }};
  }});

  var find = document.getElementById('hubFind');
  if (find) {{
    find.hidden = false;
    find.addEventListener('click', function () {{
      track('search_used', {{}});
      openFind();
    }});
  }}

  function openFind() {{
    var wrap = document.createElement('div');
    var input = document.createElement('input');
    input.type = 'search';
    /* .modal__input is the canon form field (nl-brand v2.38) — there is no
       general .nl-input class, and a hand-rolled one here would be a fork. */
    input.className = 'modal__input';
    input.setAttribute('placeholder', 'Type what is on your mind\\u2026');
    input.setAttribute('aria-label', 'Search topics');
    input.style.width = '100%';
    var list = document.createElement('div');
    list.className = 'hub-find-list';
    wrap.appendChild(input);
    wrap.appendChild(list);

    function draw(q) {{
      q = (q || '').toLowerCase().trim();
      var hits = q ? TOPICS.filter(function (t) {{ return t.find.indexOf(q) > -1; }}) : TOPICS;
      list.innerHTML = '';
      if (!hits.length) {{
        var none = document.createElement('p');
        none.className = 'hub-find-none';
        none.textContent = 'Nothing matches that. Try a single word, or close this and '
          + 'look down the list — and if it is urgent, call 116 123.';
        list.appendChild(none);
        return;
      }}
      hits.forEach(function (t) {{
        var a = document.createElement('a');
        a.href = t.href;
        a.innerHTML = '<strong></strong><span></span>';
        a.querySelector('strong').textContent = t.label;
        a.querySelector('span').textContent = t.desc;
        a.addEventListener('click', function () {{
          /* The chosen topic, not the query that found it. */
          track('search_result', {{ topic: t.href.replace(/^#/, '') }});
          ctrl.close();
        }});
        list.appendChild(a);
      }});
    }}

    draw('');
    input.addEventListener('input', function () {{ draw(this.value); }});

    var ctrl = window.NL.modal({{
      title: 'Search topics',
      body: wrap,
      buttons: [{{ label: 'Close', onClick: function (c) {{ c.close(); }} }}]
    }});
    setTimeout(function () {{ input.focus(); }}, 30);
  }}

  /* Leave for a neutral page. Shift+Escape does the same without reaching for
     the button. replace() rather than href so this page is not left in the
     back button. */
  function hide() {{
    try {{ window.location.replace('https://www.google.co.uk/'); }}
    catch (e) {{ window.location.href = 'https://www.google.co.uk/'; }}
  }}
  var exit = document.getElementById('hubExit');
  if (exit) exit.addEventListener('click', function () {{
    track('hide_page', {{}});
    hide();
  }});
  document.addEventListener('keydown', function (e) {{
    if (e.key === 'Escape' && e.shiftKey) hide();
  }});

  /* Two different jobs, and the first draft did only one of them.
     #crisis is a VIEW: it replaces the home view, so the reader starts at the
     top. #topics and #numbers are ANCHORS on the home view: the reader should
     land on that section. The old handler scrolled to 0 on every hashchange,
     so the browser jumped to the anchor and this yanked it straight back —
     "Topics" and "Who to call" appeared to do nothing.

     The anchor case also has to wait a frame. Coming from a topic page, the
     home view is still display:none at the moment the hash changes, so the
     target has no position to scroll to until the :target rule has repainted. */
  /* ── Activity logging ───────────────────────────────────────────────
     Every destination on this page is a hash, so none of it produces a
     page_view on its own — GA4 would otherwise record one hit per visit and
     nothing about what was read. These send the hash navigations as events.

     What is sent: the topic or section id, the helpline number, the host of
     an outbound link.
     What is NOT sent: anything the visitor typed. The search box on a
     wellbeing page takes free text from somebody who may be in distress;
     `search_used` records that it was opened and `search_result` records
     which of our own topics they picked, never the query itself. */
  /* Canon's NL.track is a no-op when the tag did not load — a bad id,
     localhost, a blocker — so every call site below is safe unguarded. */
  function track(name, params) {{
    if (!window.NL || !window.NL.track) return;
    /* Every event carries its edition, so the two sites can be reported on
       separately. Without it a topic_open from Trident and one from the
       National League are the same row, and neither organisation can see its
       own readers. Register `edition` as a custom dimension in GA4 alongside
       `topic` to break it down. */
    var p = params || {{}};
    p.edition = '{ed['key']}';
    window.NL.track(name, p);
  }}

  /* The poster's QR carries ?src=poster, so a scan is distinguishable from
     somebody typing the address or following a link. */
  var entry = new URLSearchParams(location.search).get('src');
  if (entry) track('hub_entry', {{ source: entry.slice(0, 40) }});

  function trackHash(hash) {{
    var id = (hash || '').replace(/^#/, '');
    if (!id) return;
    var el = document.getElementById(id);
    if (el && el.classList.contains('hub-view')) {{
      track(id === 'home' ? 'hub_home' : 'topic_open', {{ topic: id }});
    }} else {{
      track('section_jump', {{ section: id }});
    }}
  }}
  /* Fired for a deep link or a QR arrival as well as for in-page clicks. */
  if (location.hash.length > 1) trackHash(location.hash);
  window.addEventListener('hashchange', function () {{ trackHash(location.hash); }});

  document.addEventListener('click', function (e) {{
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) {{
      track('helpline_tap', {{ number: href.slice(4) }});
    }} else if (href.indexOf('mailto:') === 0) {{
      track('safeguarding_email', {{}});
    }} else if (/poster\.pdf$/.test(href)) {{
      track('poster_download', {{}});
    }} else if (/^https?:/.test(href)) {{
      var host = '';
      try {{ host = new URL(href).hostname.replace(/^www\./, ''); }} catch (err) {{}}
      track('outbound', {{ destination: host }});
    }}
  }});

  var arrivedTimer;
  function flash(el) {{
    clearTimeout(arrivedTimer);
    var prev = document.querySelector('.is-arrived');
    if (prev) prev.classList.remove('is-arrived');
    /* Forcing a reflow between the removal and the re-add is what lets the
       same destination flash twice in a row; without it the browser coalesces
       the two class changes and nothing appears to happen. */
    void el.offsetWidth;
    el.classList.add('is-arrived');
    arrivedTimer = setTimeout(function () {{ el.classList.remove('is-arrived'); }}, 1600);
  }}

  function go() {{
    var el = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
    if (!el || el.classList.contains('hub-view')) {{ window.scrollTo(0, 0); return; }}
    requestAnimationFrame(function () {{
      el.scrollIntoView({{ block: 'start' }});
      flash(el);
    }});
  }}
  window.addEventListener('hashchange', go);

  /* A link to the hash you are already on fires no hashchange, so the nav
     would do nothing at all the second time it is pressed. */
  document.addEventListener('click', function (e) {{
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a && a.getAttribute('href') === location.hash) go();
  }});
}}());
</script>

</body>
</html>
'''

# Written at the foot of the file by emit(), so --check can compare the
# rendered output against what is on disk without writing anything.
# Every topic in TOPICS must have a view in the content, or a card would link
# to a page that does not exist. Asserted rather than printed: it was a debug
# line that wrote to stdout on import, which corrupted --editions JSON output.
_missing = [t for t, *_ in TOPICS if t not in d['views']]
assert not _missing, 'TOPICS without a view in content.json: %s' % _missing


# ─────────────────────────────────────────────────────────────────────────────
# A4 POSTER
#
# Emitted from the same content as the page above, deliberately. /wellbeing/
# had a poster at wellbeing/poster.html with the numbers and the safeguarding
# contacts typed into it by hand; the moment the site's numbers moved, the
# poster on the wall was wrong and nothing said so. Here the helplines, the
# leads and the topic list all come from the same parse, so the sheet cannot
# drift from the site it points at.
#
# It is NOT a copy of the page. A poster is read by somebody standing in front
# of a wall with no phone in their hand: it carries the code, the numbers and
# what the site covers, and nothing else.

# 999 leads. It is not in the hub's own "Need to talk now?" block — that block
# is about talking — but a sheet on a dressing-room wall has to carry the
# emergency number first. All four appear somewhere on the hub.
POSTER_NUMS = [
    ('999',     'If someone is in immediate danger'),
    ('116 123', 'Samaritans, free, day or night'),
    ('111',     'NHS urgent mental health help'),
    ('85258',   'Shout — text SHOUT, free, 24/7'),
]

SPRITE_SRC = open(os.path.join(REPO, 'assets', 'icons', 'sprites.svg'), encoding='utf-8').read()


def inline_symbol(name):
    """Lift one <symbol> out of the sprite and inline it as an <svg>.

    The poster is printed, often from a file somebody has saved. A
    <use href="/assets/icons/sprites.svg#..."> resolves to nothing without the
    network and prints a blank square, which on a wall is worse than no glyph.
    """
    m = re.search(r'<symbol id="icon-%s"([^>]*)>([\s\S]*?)</symbol>' % re.escape(name), SPRITE_SRC)
    assert m, 'sprite has no icon-' + name
    return '<svg%s>%s</svg>' % (m.group(1), m.group(2))


poster_topics = '\n'.join(
    '      <li><span class="tg tg--%s">%s</span><b>%s</b></li>'
    % (hue, inline_symbol(glyph), esc(label))
    for tid, label, _, glyph, hue in TOPICS)

poster_nums = '\n'.join(
    '      <div class="num"><b>%s</b><span>%s</span></div>' % (esc(v), esc(note))
    for v, note in POSTER_NUMS)

# NAMES OFF, at Martyn Cannon's request (08/10/2026) — and right for the
# medium. A web page is corrected in a minute; an A4 on a dressing-room wall
# in 72 clubs is not, so the moment either post-holder changes role every
# printed sheet is wrong and nobody takes it down. The safeguarding@ addresses
# are ROLE inboxes rather than personal ones, so dropping the names keeps the
# route reachable and makes the sheet outlive whoever currently holds the post.
def poster(ed):
    """One edition's A4 poster source. See render-wellbeing-poster.js."""
    return resolve(ed, _poster(ed))


def _poster(ed):
    poster_leads = '\n'.join(
        '        <div class="sg__p"><b>%s</b>%s</div>'
        % (esc(p['role']), esc(p['email']))
        for p in leads_for(ed))

    return f'''<!DOCTYPE html>
<!--
  NL Tools — Wellbeing Hub poster (A4)
  Version: v1.5 (08/10/2026)
  File: /wellbeing-hub/poster.html

  An A4 single sheet for dressing rooms, treatment rooms and notice boards.

  DO NOT TELL ANYBODY TO PRINT THIS PAGE. Serve wellbeing-hub/poster.pdf
  instead — a browser's print dialog defaults to background graphics OFF, adds
  its own header and footer, and fits to the printable area, which between
  them wreck the sheet. Reported as "the ctrl p mangles it totally", which is
  precisely what those defaults do.

  This HTML is the SOURCE. The PDF is rendered from it by
  scripts/render-wellbeing-poster.js and committed; tests/poster-pdf.test.mjs
  fails the build if this file is newer than the PDF.

  It replaces the retired wellbeing/poster.html, which was deleted on
  15/08/2026 in the Estate v0.2 sweep. That one had its helplines and its
  safeguarding contacts typed in by hand, so the sheet on the wall could go
  stale without anything saying so. This one is generated from the same parse
  as /wellbeing-hub/index.html — the numbers, the leads and the topic list
  cannot disagree with the site the code points at.

  THE QR IS VERIFIED, not merely generated. /assets/wellbeing-hub-qr.svg was
  built with the repo's own vendored encoder and then DECODED BACK at 370,
  220, 150 and 96px; all four read https://nl.tools/wellbeing-hub. A QR
  nobody has scanned is a rectangle of noise pinned to a wall. Error
  correction is H — the highest — because posters get scuffed, photographed
  at an angle and printed smaller than intended.

  Records nothing, loads nothing from a third party. Carbona is self-hosted so
  the sheet prints correctly from a machine that cannot reach Typekit.

  CHANGELOG
  This sheet has its own version because it changes on its own: the six
  entries below are all poster-only. It sat at "v1.0 — initial build" through
  three rounds of edits, which told anyone reading it that nothing had
  happened since 5 October. The wider tool's changelog is in index.html.

  v1.5 (08/10/2026) — PRINTING THIS PAGE NOW PRINTS AN INSTRUCTION, not a
    ruined poster. "but ctrl p doesn't do the right thing" — it doesn't, and
    nothing in this file can make it, because background graphics, the
    browser's own header and footer and fit-to-printable-area are the
    operator's settings and not ours. v1.3 added a line asking people not to
    press it and then let them. The print stylesheet now hides the sheet and
    prints one line pointing at the PDF; one wasted side of A4 beats a wall
    poster with the QR missing. The download is also a button rather than an
    underlined phrase in a sentence — on this page pressing it is the point,
    and everything below it is a preview.
  v1.4 (08/10/2026) — "not a diagnosis" in the disclaimer becomes "not
    medical advice". It sat two lines below "You do not need a diagnosis, or
    the right words", so the sheet used one word for reassurance and for
    disclaimer in the same breath. The page's footer says the same thing in
    the same words.
  v1.3 (08/10/2026) — Ships as a PDF. See the note at the top of this file and
    scripts/render-wellbeing-poster.js: a browser print dialog mangles this
    sheet, so poster.pdf is the artefact and this HTML is only its source.
    The screen hint points at the PDF and says not to print the page.
  v1.2 (08/10/2026) — Credit line removed (the masthead two inches above
    already says it) and a 24mm mail glyph on the safeguarding contacts, navy
    rather than the helplines' red.
  v1.1 (08/10/2026) — Safeguarding leads' NAMES OFF at Martyn Cannon's
    request; the roles and the safeguarding@ role inboxes stay, so the sheet
    outlives whoever holds the post. That space now carries the eight topic
    glyphs, inlined from the sprite. Lede corrected: it still promised
    "nothing you look at is recorded" after the GA4 tag went in.
  v1.0 (05/10/2026) — Initial build, replacing the retired /wellbeing/ poster.
-->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Wellbeing Hub poster — The National League</title>
  <meta name="robots" content="noindex">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32x32.png">

  <link rel="stylesheet" href="/system/nl-brand.css?v=67">

  <style>
  @page {{ size: A4 portrait; margin: 11mm; }}

  @font-face {{
    font-family: 'carbona-hub';
    src: url('/assets/fonts/carbona-400.woff2') format('woff2');
    font-weight: 100 500; font-style: normal; font-display: swap;
  }}
  @font-face {{
    font-family: 'carbona-hub';
    src: url('/assets/fonts/carbona-700.woff2') format('woff2');
    font-weight: 501 800; font-style: normal; font-display: swap;
  }}
  @font-face {{
    font-family: 'carbona-hub';
    src: url('/assets/fonts/carbona-900.woff2') format('woff2');
    font-weight: 801 900; font-style: normal; font-display: swap;
  }}
  :root {{ --font: 'carbona-hub', ui-sans-serif, system-ui, -apple-system, sans-serif; }}

  /* Fixed pt sizes, not the fluid --text-* ladder. The ladder is sized in vw
     for a browser viewport; on a sheet of A4 there is no viewport, and a
     clamp() against one prints at whatever the preview window happened to be.
     This is the canon's documented exception for print output. */
  html, body {{ height: auto; min-height: 0; }}
  body {{ background: var(--navy-50); margin: 0; padding: 18px; }}

  /* Screen only — hidden in print. Points at the PDF rather than at Ctrl+P,
     because a browser's print dialog ships with background graphics off, its
     own header and footer, and "fit to printable area", and between them they
     wreck this sheet. See scripts/render-wellbeing-poster.js. */
  .hint {{
    max-width: 210mm; margin: 0 auto 14px;
    display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px;
    font-size: 13px; color: var(--text-muted);
  }}
  /* A sentence with an underlined phrase in it asks to be read. A button
     asks to be pressed, and pressing it is the whole point of this page:
     what follows the button is a preview of the PDF, not the thing to
     print. */
  .hint__dl {{
    display: inline-flex; align-items: center; gap: 7px;
    background: var(--navy); color: var(--white);
    font-size: 13px; font-weight: 900; text-decoration: none;
    padding: 9px 15px; border-radius: 6px;
  }}
  .hint__dl:hover {{ background: var(--navy-600); }}
  .hint__dl svg {{ width: 15px; height: 15px; }}

  /* Ctrl+P ON THIS PAGE CANNOT PRODUCE THE POSTER, so it must not appear to.
     The hint said "don't print this page" and then let you print it anyway —
     a browser's print dialog has background graphics off, its own header and
     footer, and fit-to-printable-area, and between them they wreck the
     sheet. Reported twice: "the ctrl p mangles it totally", then "but ctrl p
     doesn't do the right thing". It doesn't, and no amount of CSS here will
     fix it, because those are the operator's settings and not ours. So the
     print stylesheet below hides the sheet and prints one line of
     instruction instead. One wasted sheet of A4 beats a wall poster with no
     QR on it and the masthead missing.

     THE RENDERER PRINTS TOO. puppeteer's page.pdf() emulates print media, so
     a blanket `.sheet {{ display: none }}` in @media print would have emptied
     poster.pdf — the blocker would have destroyed the very file it exists to
     protect, and the renderer's "1 page" check would have passed, because a
     page of instruction is also one page. So the blocker is gated on
     html.is-render, which the script at the foot of this file sets from
     ?render=1, and the renderer asserts the opt-out actually took before it
     writes anything. No query string means blocked, so a saved copy, a
     JS-off browser and anyone who just pressed Ctrl+P all fail safe. */
  .printnote {{ display: none; }}
  .sheet {{
    max-width: 210mm; margin: 0 auto; background: var(--white);
    padding: 16mm 14mm; box-shadow: 0 2px 18px var(--navy-200);
  }}

  .hd {{
    display: flex; align-items: center; gap: 12px;
    background: var(--navy); color: var(--white);
    padding: 10px 14px; border-radius: 6px;
  }}
  .hd img {{ width: 44px; height: 44px; }}
  .hd b {{ display: block; font-size: 25pt; font-weight: 900; line-height: 1;
           text-transform: uppercase; letter-spacing: -0.01em; }}
  .hd i {{ display: block; font-size: 10.5pt; font-weight: 800; font-style: normal;
           text-transform: uppercase; letter-spacing: 0.1em; margin-top: 3px; }}

  h1 {{ font-size: 28pt; font-weight: 900; color: var(--navy);
        line-height: 1.1; margin: 20px 0 9px; }}
  .lede {{ font-size: 13pt; line-height: 1.45; color: var(--text); margin: 0 0 20px; }}

  .split {{ display: flex; gap: 14px; align-items: flex-start; }}
  .col {{ flex: 1 1 0; min-width: 0; }}

  h2 {{ font-size: 13.5pt; font-weight: 900; color: var(--navy); margin: 0 0 7px;
        text-transform: uppercase; letter-spacing: 0.06em; }}

  /* The space Martyn's and Benny's names used to take, spent on the eight
     topic glyphs. A single brain or phone icon would decorate the sheet; this
     also tells somebody walking past what is actually on the hub, which is
     the only job a dressing-room poster has. */
  .topics {{ list-style: none; margin: 0; padding: 0; display: grid;
             grid-template-columns: 1fr 1fr; gap: 12px 14px; }}
  .topics li {{ display: flex; align-items: center; gap: 9px; break-inside: avoid; }}
  .topics li b {{ font-size: 12pt; font-weight: 700; color: var(--text); line-height: 1.2; }}
  .tg {{
    flex: none; display: grid; place-items: center;
    width: 40px; height: 40px; border-radius: 12px;
  }}
  .tg svg {{ width: 25px; height: 25px; }}
  .tg--navy   {{ background: var(--navy-50);     color: var(--navy-600); }}
  .tg--green  {{ background: var(--green-light); color: var(--green); }}
  .tg--amber  {{ background: var(--amber-light); color: var(--amber-deep); }}
  .tg--blue   {{ background: var(--blue-light);  color: var(--blue); }}
  .tg--purple {{ background: var(--purple-light);color: var(--purple); }}
  .tg--urgent {{ background: var(--primary-100); color: var(--primary); }}

  .qr {{ flex: none; width: 58mm; text-align: center; }}
  .qr img {{ width: 58mm; height: 58mm; display: block; }}
  .qr b {{ display: block; font-size: 14pt; font-weight: 900; color: var(--navy);
           margin-top: 5px; line-height: 1.15; }}
  .qr span {{ display: block; font-size: 10pt; color: var(--text-muted); margin-top: 3px; }}

  .nums {{ margin-top: 18px; padding-top: 15px; border-top: 2px solid var(--primary); }}
  .nums__g {{ display: flex; gap: 10px; }}
  .num {{ flex: 1 1 0; }}
  .num b {{ display: block; font-size: 24pt; font-weight: 900; color: var(--primary);
            line-height: 1; }}
  .num span {{ display: block; font-size: 10pt; color: var(--text-muted);
               margin-top: 4px; line-height: 1.3; }}

  .sg {{ margin-top: 18px; padding-top: 15px; border-top: 1px solid var(--border); }}
  .sg__row {{ display: flex; align-items: center; gap: 16px; }}
  /* Navy, not the helplines' red. Emailing a safeguarding inbox is a
     different act from ringing 999, and the sheet should not say otherwise. */
  .sg__mark {{
    flex: none; display: grid; place-items: center;
    width: 24mm; height: 24mm; border-radius: 14px;
    background: var(--navy-50); color: var(--navy);
  }}
  .sg__mark svg {{ width: 15mm; height: 15mm; }}
  .sg__g {{ display: flex; gap: 14px; flex: 1 1 auto; min-width: 0; }}
  .sg__p {{ flex: 1 1 0; font-size: 11pt; color: var(--text-muted); line-height: 1.4; }}
  .sg__p b {{ display: block; font-size: 12pt; font-weight: 900; color: var(--text); }}

  .ft {{ margin-top: 17px; padding-top: 14px; border-top: 1px solid var(--border);
         font-size: 10pt; color: var(--text-muted); line-height: 1.45; }}
  .ft b {{ color: var(--text); }}
  .ft p {{ margin: 0 0 5px; }}
  .ft p:last-child {{ margin: 0; }}

  @media print {{
    .hint {{ display: none; }}
    body {{ background: var(--white); padding: 0; }}
    .sheet {{ max-width: none; padding: 0; box-shadow: none; }}

    html:not(.is-render) .sheet {{ display: none; }}
    html:not(.is-render) .printnote {{
      display: block; padding: 40mm 20mm 0;
      font-size: 14pt; line-height: 1.5; color: #000;
    }}
    .printnote b {{ display: block; font-size: 20pt; margin-bottom: 10px; }}
    .printnote code {{ font-size: 13pt; }}
  }}{poster_accent_css(ed)}
  </style>
</head>
<body>

<p class="hint">
  <a class="hint__dl" href="/{ed['slug']}/poster.pdf" download>{inline_symbol('download')}Download the A4 poster (PDF)</a>
  <span>Print that file, not this page — a browser’s own print settings mangle the sheet. Below is a preview of it.</span>
</p>

<div class="printnote">
  <b>Print the PDF, not this page.</b>
  <p>This page is a preview. A browser’s print settings leave out the
    background colours and the QR code, so the sheet comes out unusable.</p>
  <p>Open <code>https://nl.tools/{ed['slug']}/poster.pdf</code> and print that
    instead — or press the download button on this page.</p>
</div>

<div class="sheet">

  <div class="hd">
    {poster_logo(ed)}
    <span>
      <b>Wellbeing Hub</b>{poster_kicker(ed)}
    </span>
  </div>

  <h1>{esc(d['welcome']['h1'])}</h1>
  <p class="lede">Scan the code for information, practical steps and confidential support.
    No sign-in and no personal details.</p>

  <div class="split">
    <div class="col">
      <h2>What the hub covers</h2>
      <ul class="topics">
{poster_topics}
      </ul>
    </div>
    <div class="qr">
      <img src="/assets/{ed['slug']}-qr.svg" alt="QR code linking to nl.tools/{ed['slug']}">
      <b>nl.tools/<br>{ed['slug']}</b>
      <span>Or type it into any browser</span>
    </div>
  </div>

  <div class="nums">
    <h2>Need help now?</h2>
    <div class="nums__g">
{poster_nums}
    </div>
  </div>

  <div class="sg">
    <h2>Worried about a child, or an adult at risk?</h2>
    <div class="sg__row">
      <span class="sg__mark">{inline_symbol('email')}</span>
      <div class="sg__g">
{poster_leads}
      </div>
    </div>
  </div>

  <div class="ft">
    <p><b>You do not need a diagnosis, or the right words, before you speak to someone.</b>
      {esc(d['safeguarding_note'])}</p>
    <p>A route to the right support, not medical advice. These pages do not replace a GP,
      clinician or your club’s medical staff.</p>
  </div>

</div>

<!-- The renderer's opt-out. Only scripts/render-wellbeing-poster.js asks for
     ?render=1; a human never does, so Ctrl+P gets the instruction instead of
     a ruined sheet. The renderer checks this took effect before it writes the
     PDF, because the failure mode is a one-page file that passes a page
     count. -->
<script>
  if (/[?&]render=1(&|$)/.test(location.search)) {{
    document.documentElement.className += ' is-render';
  }}
</script>

</body>
</html>
'''

def emit(check=False):
    """Write both files, or in --check mode report drift and write nothing.

    --check is what CI runs. It exists because the generated HTML is committed:
    without it, somebody editing index.html by hand would appear to succeed
    until the next generator run silently reverted them, and the reverse —
    editing this file and forgetting to commit the output — would ship a
    source and an artefact that disagree. Both have a bad failure mode and
    neither is visible in a diff review.
    """
    files = []
    for ed in EDITIONS:
        files.append((out_path(ed, 'index.html'), page(ed)))
        files.append((out_path(ed, 'poster.html'), poster(ed)))
    if check:
        drift = []
        for path, rendered in files:
            try:
                on_disk = io.open(path, encoding='utf-8').read()
            except OSError:
                drift.append('%s is missing' % os.path.relpath(path, REPO))
                continue
            if on_disk != rendered:
                drift.append('%s differs from the generator (%d chars on disk, %d rendered)'
                             % (os.path.relpath(path, REPO), len(on_disk), len(rendered)))
        if drift:
            sys.stderr.write(
                'the wellbeing hub editions are out of sync with their '
                'source:\n  ' +
                '\n  '.join(drift) +
                '\n\nRun: python3 scripts/build-wellbeing-hub.py\n'
                'Then commit the regenerated HTML. Do not edit it by hand — it '
                'is overwritten.\n')
            return 1
        print('wellbeing hub: all %d generated files match what is committed'
              % len(files))
        return 0
    for path, rendered in files:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        io.open(path, 'w', encoding='utf-8').write(rendered)
        print('wrote', os.path.relpath(path, REPO), len(rendered), 'chars')
    return 0


if __name__ == '__main__':
    if '--editions' in sys.argv[1:]:
        # The edition list, for tooling that is not Python — the QR builder and
        # the tests read it from here so there is no second copy of the slugs
        # to drift. One source, as asked.
        print(json.dumps([{k: ed[k] for k in ('key', 'slug', 'org', 'noindex')}
                          for ed in EDITIONS], indent=2))
        sys.exit(0)
    sys.exit(emit(check='--check' in sys.argv[1:]))
