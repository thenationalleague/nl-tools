#!/usr/bin/env node
/**
 * scripts/build-inventory.js — estate scanner.
 *
 * Walks every HTML page in the repo and writes assets/data/tools-inventory.json,
 * the data behind the Estate tool at /estate/.
 *
 * The problem it solves: this repo has grown a long tail of pages that nothing
 * lists. Gated tools appear on the portal only if RTDB `tools/<toolKey>` has a
 * record; everything else — public companion forms, passcode pages, CMS embeds,
 * lab experiments, redirect stubs — appears nowhere at all. You cannot decide
 * what to retire if you cannot see what exists.
 *
 * What it records per page, and why:
 *   gated / toolKey       does it load auth-guard, and under which key
 *   registered            is that key in the in-repo registry snapshot
 *   species               what kind of page this is (see classify() below)
 *   admin                 a sibling admin page, so a public form and the gated
 *                         screen behind it read as one thing
 *   inbound               which repo files link to this URL — the ONLY reliable
 *                         staleness signal here (see the note on dates below)
 *   version / summary     lifted from the file's header comment block
 *
 * On dates: git mtimes are near-useless in this repo. Brand sweeps rewrite every
 * file at once, so a page abandoned in April and a page shipped yesterday carry
 * the same last-commit date. `commits` (how many times a file has ever been
 * touched) survives that better, and inbound-link count survives it entirely.
 * Both are emitted; the UI leans on inbound.
 *
 * Deliberately NOT recorded: commit authors, commit subjects, or anything else
 * carrying a person's name. This file is committed to a public repo.
 *
 * Run:  npm run build-inventory
 * CI:   .github/workflows/build-inventory.yml, on push to main.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'assets/data/tools-inventory.json');
const REGISTRY = path.join(REPO, 'system/rtdb/tools-registry.snapshot.json');
const PARKED = path.join(REPO, 'system/rtdb/tools-registry.parked.json');

/* Directories that are not pages-under-management. node_modules and .git are
   obvious; _template is the scaffold source, not a live page. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '_template']);

/* Where lab/experiment/mockup material lives. Pages here are expected to be
   disposable — the point of flagging them is that nothing else says so.
   public/ is deliberately NOT here: it holds a real standalone edition of a
   tool, not an experiment, and prejudging it as scrap would be wrong. */
const SANDBOX_PREFIXES = ['lab/', 'decks/', 'system/brand-v3-mockups/'];

/* ── file walking ────────────────────────────────────────────────────────── */

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Repo-relative POSIX path. */
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

/** Served URL for a page path. index.html collapses to its directory. */
function urlFor(relPath) {
  if (relPath === 'index.html') return '/';
  if (relPath.endsWith('/index.html')) return '/' + relPath.slice(0, -'index.html'.length);
  return '/' + relPath;
}

/* ── header-comment mining ───────────────────────────────────────────────── */

/**
 * Pages in this repo open with a block comment carrying a version line and a
 * prose description. Both are worth surfacing — the description is usually the
 * only statement anywhere of what a loose page is FOR.
 *
 * The comment must be located by index, not by a bounded lazy regex: several
 * headers carry changelogs thousands of characters long, and a capped `<!--
 * ... -->` match silently backtracks past them to the next comment in the file
 * (which is nearly always the boilerplate favicon note). That produced a first
 * run where a dozen unrelated pages all "did" the same thing.
 */
function readHeader(text) {
  const NONE = { version: null, versionDate: null, summary: null };
  const open = text.indexOf('<!--');
  if (open === -1) return NONE;
  const close = text.indexOf('-->', open);
  if (close === -1) return NONE;

  /* A header block always precedes <title>. Anything after it is in-page
     commentary — in practice the boilerplate favicon note, which is identical
     across every page and would otherwise be reported as a dozen tools'
     descriptions. A page with no header block gets null, and the UI says so. */
  const titleAt = text.search(/<title[\s>]/i);
  if (titleAt !== -1 && open > titleAt) return NONE;

  const body = text.slice(open + 4, close);
  const ver = body.match(/Version:\s*(v?[\d.]+)\s*(?:\(([^)]+)\))?/i);

  /* Take the first PARAGRAPH of prose, not the first line — descriptions wrap,
     and a lone line is usually half a sentence. Metadata lines (File:, Version:,
     CHANGELOG, the "NL Tools — Name" title line), bullets and changelog entries
     are skipped; the first run of ordinary lines after them is the description. */
  const para = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) {
      if (para.length) break;   // blank line ends the first paragraph
      continue;
    }
    /* A CHANGELOG heading ends the description for good. Entries below it wrap
       across lines, and a continuation line reads as prose to every heuristic
       here — which is how the login page came to be described as "Cloud
       Functions (consumeInvite / submitAccessRequest ...". A header that is all
       metadata and changelog simply has no description, and says so. */
    if (/^changelog\b/i.test(line)) break;
    if (/^(version|file|storage|access|run|ci)\b\s*:?/i.test(line)) { if (para.length) break; continue; }
    if (/^v\d[\d.]*\s*[(—-]/i.test(line)) { if (para.length) break; continue; }
    if (/^[-*•]/.test(line)) { if (para.length) break; continue; }
    if (/^NL Tools\s*[—-]/i.test(line) && !para.length) continue;
    if (/^[\w/.-]+\.html\b/i.test(line) && !para.length) continue;   // "club-kits/index.html v1.0"
    para.push(line);
    if (para.join(' ').length > 240) break;
  }

  let summary = para.join(' ').replace(/\s+/g, ' ').trim();
  if (summary.length > 240) {
    /* Cut on a word boundary, not mid-token — these run into field lists and
       code identifiers, and a hard 240th-character slice leaves things like
       "leads{areaKey" hanging. */
    const cut = summary.slice(0, 240);
    const lastSpace = cut.lastIndexOf(' ');
    summary = (lastSpace > 180 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, '') + '…';
  }
  return {
    version: ver ? ver[1] : null,
    versionDate: ver && ver[2] ? ver[2] : null,
    summary: summary || null
  };
}

/** Title, in preference order: NL_TOOL.title, then <title> minus the suffix. */
function readTitle(text) {
  const nl = text.match(/window\.NL_TOOL\s*=\s*\{[\s\S]{0,300}?title:\s*['"]([^'"]+)['"]/);
  if (nl) return nl[1];
  const t = text.match(/<title>([^<]+)<\/title>/i);
  if (t) return t[1].replace(/\s*—\s*NL Tools\s*$/, '').trim();
  return null;
}

/* ── classification ──────────────────────────────────────────────────────── */

/**
 * The group a page belongs to: its top-level directory. This is the unit that
 * matters for "is there an admin page too" — /uw-promo/, /uw-promo/club/ and
 * /uw-promo/admin/ are one thing in three directories, and same-directory
 * grouping splits them into three unrelated orphans.
 */
function groupOf(relPath) {
  const seg = relPath.split('/');
  return seg.length === 1 ? '' : seg[0];
}

/**
 * Species, in priority order. This is the whole point of the scan: "loose" is
 * not one thing, and the retire decision is completely different per species.
 *
 *   tool       gated, loads auth-guard — behind Firebase Auth
 *   root       the login page at /. Never a retire candidate.
 *   asset      generated directory-listing stubs under assets/
 *   embed      embeds/*.html — pasted into the Urban Zoo CMS. Zero inbound
 *              links is NORMAL here; the reference lives in someone else's CMS.
 *   redirect   a stub that forwards elsewhere. Cheap to keep, safe to drop once
 *              the old links have died.
 *   sandbox    lab / decks / mockups — disposable by construction
 *   companion  an ungated page in a group that also holds a gated one: the
 *              public face of a gated admin. Load-bearing despite being ungated.
 *   public     a standalone ungated page that is nobody's companion
 */
function classify(relPath, text, gated, groupHasGated) {
  if (gated) return 'tool';
  if (relPath === 'index.html') return 'root';
  if (relPath.startsWith('assets/')) return 'asset';
  if (relPath.startsWith('embeds/')) return 'embed';
  if (/location\.replace\(|http-equiv=["']refresh/i.test(text) && text.length < 6000) return 'redirect';
  if (SANDBOX_PREFIXES.some((p) => relPath.startsWith(p))) return 'sandbox';
  if (groupHasGated) return 'companion';
  return 'public';
}

/* ── git ─────────────────────────────────────────────────────────────────── */

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

/**
 * Date and commit count only — never author or subject. See the header note:
 * this JSON is world-readable and commit metadata carries names.
 */
function gitFacts(relPath) {
  const date = git(['log', '-1', '--format=%ad', '--date=short', '--', relPath], null);
  const count = git(['rev-list', '--count', 'HEAD', '--', relPath], '0');
  return { lastCommit: date || null, commits: Number(count) || 0 };
}

/* ── main ────────────────────────────────────────────────────────────────── */

function main() {
  const registry = fs.existsSync(REGISTRY)
    ? JSON.parse(fs.readFileSync(REGISTRY, 'utf8'))
    : {};

  /* Parked tools are DELIBERATELY off the portal — record pulled from tools/
     and held in the parked file, code left in the repo, superadmin-only. They
     look identical to an unregistered tool from the page alone, and conflating
     the two turns eight considered decisions into eight false alarms.
     See system/tool-status-and-access.md. */
  const parked = fs.existsSync(PARKED)
    ? JSON.parse(fs.readFileSync(PARKED, 'utf8'))
    : {};
  delete parked.__README__;   // documentation key, not a tool record

  const allFiles = walk(REPO);
  const htmlFiles = allFiles.filter((f) => f.endsWith('.html')).map(rel).sort();

  /* Which groups contain at least one gated page — needed before
     classification, so a loose sibling can be recognised as a companion. */
  const gatedGroups = new Set();
  const texts = new Map();
  for (const f of htmlFiles) {
    const text = fs.readFileSync(path.join(REPO, f), 'utf8');
    texts.set(f, text);
    if (text.includes('/system/auth-guard.js')) gatedGroups.add(groupOf(f));
  }

  const pages = [];
  for (const f of htmlFiles) {
    const text = texts.get(f);
    const dir = path.posix.dirname(f);
    const group = groupOf(f);
    const gated = text.includes('/system/auth-guard.js');
    const keyMatch = text.match(/NL_TOOL_KEY\s*=\s*['"]([^'"]+)['"]/);
    const toolKey = keyMatch ? keyMatch[1] : null;
    const header = readHeader(text);

    pages.push({
      path: f,
      url: urlFor(f),
      dir: dir === '.' ? '' : dir,
      group,
      title: readTitle(text),
      species: classify(f, text, gated, gatedGroups.has(group)),
      gated,
      toolKey,
      /* live   = has a tools/ record, shows on the portal
         parked = deliberately held off the portal, code retained
         none   = neither. The only one of the three worth an alarm. */
      /* 'portal' is the portal itself, not a card on it. It will never have a
         tools/ record and flagging it as unaccounted-for is permanent noise. */
      registryState: !toolKey || toolKey === 'portal' ? null
        : registry[toolKey] ? 'live'
        : parked[toolKey] ? 'parked'
        : 'none',
      registered: Boolean(toolKey && registry[toolKey]),
      parkedStage: toolKey && parked[toolKey] ? (parked[toolKey]._parkedStage || null) : null,
      registry: toolKey && (registry[toolKey] || parked[toolKey])
        ? (function (r) {
            return {
              label: r.label || null,
              url: r.url || null,
              audience: r.audience || null,
              icon: r.icon || null,
              description: r.description || null
            };
          })(registry[toolKey] || parked[toolKey])
        : null,
      version: header.version,
      versionDate: header.versionDate,
      summary: header.summary,
      bytes: Buffer.byteLength(text),
      ...gitFacts(f),
      inbound: []
    });
  }

  /* Inbound links. One pass over every text file in the repo, checking which
     page URLs it mentions — cheaper and more accurate than a grep per page.
     A page never counts as linking to itself. */
  const urlToPage = new Map(pages.map((p) => [p.url, p]));
  const outRel = rel(OUT);
  const scannable = allFiles
    .map(rel)
    .filter((f) => /\.(html|js|json|md|css|yml|yaml)$/i.test(f))
    /* The inventory itself lists every URL in the repo, so leaving it in gives
       every page a phantom inbound link and hides the orphans this whole tool
       exists to find. */
    .filter((f) => f !== outRel);

  /**
   * Relative forms of page P as they would be written inside file F.
   *
   * Absolute-path matching alone is not enough, and the gap is not academic:
   * commercial-benchmarking/dashboard.js builds its club capability link as
   * `new URL('link.html?t=' + tok, location.href)`. The string
   * "/commercial-benchmarking/link.html" appears nowhere, so that page reported
   * zero inbound links and read as an orphan — while being the live route
   * clubs without an account use to see their benchmarks. A retire list built
   * on the absolute form alone would have deleted it.
   *
   * Only sibling-ish forms are returned. A bare "index.html" is skipped: it
   * appears in nearly every directory and would link everything to everything.
   */
  /* Directories holding pages but no index.html — see relativeForms(). */
  const dirsWithIndex = new Set(
    pages.filter((p) => p.path.endsWith('/index.html')).map((p) => path.posix.dirname(p.path))
  );
  const bareCollections = new Set(
    pages.map((p) => path.posix.dirname(p.path)).filter((d) => d !== '.' && !dirsWithIndex.has(d))
  );

  function relativeForms(fromFile, page) {
    const fromDir = path.posix.dirname(fromFile);
    const forms = [];

    const asFile = path.posix.relative(fromDir, page.path);
    if (asFile && asFile !== 'index.html' && !asFile.startsWith('..')) forms.push(asFile);

    if (page.path.endsWith('/index.html')) {
      const asDir = path.posix.relative(fromDir, path.posix.dirname(page.path));
      if (asDir && !asDir.startsWith('..')) forms.push(asDir + '/');
    }

    /* Directory-level credit, for collections referenced as a set rather than
       file by file: system/brand-v3-scale-plan.md points at `./brand-v3-mockups/`
       and never names the three pages inside it, so all three read as orphans
       while being live reference material for an in-progress plan.
       Restricted to directories with no index.html of their own — a bare
       collection. Without that guard, any mention of "handbook/" would credit
       every page under it, and the metric would stop meaning anything. */
    if (!page.path.endsWith('/index.html') && bareCollections.has(path.posix.dirname(page.path))) {
      const asDir = path.posix.relative(fromDir, path.posix.dirname(page.path));
      if (asDir && !asDir.startsWith('..')) forms.push(asDir + '/');
    }
    return forms;
  }

  for (const f of scannable) {
    let text;
    try {
      text = fs.readFileSync(path.join(REPO, f), 'utf8');
    } catch {
      continue;
    }
    for (const [url, page] of urlToPage) {
      if (url === '/') continue;          // matches nearly everything, tells you nothing
      if (f === page.path) continue;      // self-reference

      if (text.includes(url)) { page.inbound.push(f); continue; }

      const forms = relativeForms(f, page);
      if (forms.some((r) => text.includes(r))) page.inbound.push(f);
    }
  }
  for (const p of pages) p.inbound.sort();

  /* Group pages by top-level directory so a public form and its gated admin
     read as one unit — that is the "is there an admin page too" question. */
  const byGroup = new Map();
  for (const p of pages) {
    if (!byGroup.has(p.group)) byGroup.set(p.group, []);
    byGroup.get(p.group).push(p);
  }
  for (const p of pages) {
    const peers = (byGroup.get(p.group) || []).filter((s) => s !== p);
    const admin = peers.find((s) => /(^|\/)admin(\/|\.html$)/i.test(s.path) || /\badmin\b/i.test(s.title || ''));
    p.adminPage = admin ? admin.url : null;
    p.adminGated = admin ? admin.gated : null;
    p.siblings = peers.map((s) => s.url);
  }

  /* Registry records pointing at a page that does not exist, or at one that
     turned out not to be gated. Both are real breakage: the portal shows a
     card that leads nowhere, or advertises a gate that is not there. */
  const pageUrls = new Set(pages.map((p) => p.url));
  const orphanRecords = Object.entries(registry)
    .filter(([, v]) => v.url && !pageUrls.has(v.url))
    .map(([key, v]) => ({ toolKey: key, label: v.label || null, url: v.url }));

  const ungatedRegistered = Object.entries(registry)
    .filter(([, v]) => {
      const page = v.url && urlToPage.get(v.url);
      return page && !page.gated;
    })
    .map(([key, v]) => ({ toolKey: key, label: v.label || null, url: v.url }));

  const inventory = {
    /* The HEAD commit date, not wall-clock. A wall-clock stamp changes on every
       run, so the workflow's "commit only if changed" check would never hold and
       every push to main would produce a second, empty-in-substance commit.
       Tying it to the commit also makes the stamp mean something: the state of
       the repo this inventory describes. */
    generated: git(['log', '-1', '--format=%cI'], '') || null,
    /* Read from the in-repo snapshot, NOT live RTDB — a session cannot read the
       database. The snapshot can lag what is actually deployed, so a missing
       registry record means "not in the snapshot", not "definitely absent". The
       UI says so rather than asserting breakage. */
    registrySource: 'system/rtdb/tools-registry.snapshot.json',
    counts: {
      total: pages.length,
      bySpecies: pages.reduce((acc, p) => {
        acc[p.species] = (acc[p.species] || 0) + 1;
        return acc;
      }, {}),
      gated: pages.filter((p) => p.gated).length,
      parkedTools: pages.filter((p) => p.registryState === 'parked').length,
      unregisteredTools: pages.filter((p) => p.registryState === 'none').length,
      noInbound: pages.filter((p) => p.inbound.length === 0).length
    },
    orphanRecords,
    ungatedRegistered,
    pages
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(inventory, null, 2) + '\n');

  const c = inventory.counts;
  console.log(`build-inventory: ${c.total} pages → ${rel(OUT)}`);
  console.log(`  species: ${Object.entries(c.bySpecies).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  ${c.parkedTools} parked tool(s); ${c.unregisteredTools} in neither registry file`);
  console.log(`  ${c.noInbound} page(s) with no inbound repo link`);
  if (orphanRecords.length) {
    console.log(`  ${orphanRecords.length} registry record(s) pointing at a missing page`);
  }
  if (ungatedRegistered.length) {
    console.log(`  ${ungatedRegistered.length} registry record(s) pointing at an ungated page`);
  }
}

main();
