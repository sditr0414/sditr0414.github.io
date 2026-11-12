"""Resumable, chunked version of css_prune.py.

Differences from css_prune.py (see that file for the original idea):
  * detection also compares the geometry of EVERY element (rects + scroll sizes), so a declaration whose removal
    only shifts ancestors/siblings (the cause of the earlier verification mismatches) is no longer called dead;
  * rules whose selectors depend on runtime state (classes toggled by app.js, [attr] selectors, dynamically created
    widgets), `!important`, vendor-prefixed and duplicated (fallback) declarations are never candidates;
  * network is blocked (fonts, video) so the page is deterministic; extra verify contexts (scroll positions,
    every project hash); per-context detection results are cached on disk (resumable, runs in N parallel parts);
  * candidates are combined with a cumulative bisect against persistent pages (cheap scoped compare);
  * a strict final verification (full computed style of all elements, 0.15px tolerance) runs in parts.

Usage: css_prune2.py detect PART NPARTS | combine | final PART NPARTS | report
Scratch dir is taken from env PRUNE_SCRATCH.
"""
import json, os, re, subprocess, sys, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from css_prune import parse, flat_rules, emit, strip_comments, split_top, FREEZE, ROOT, CSS, VERIFY_JS, sync_playwright

SCRATCH = Path(os.environ.get('PRUNE_SCRATCH', '/tmp'))
DOCS = Path(os.environ.get('PRUNE_DOCS', str(ROOT / 'docs')))   # snapshot of docs/ to work on (the live site keeps changing)
CSS = DOCS / 'app.css'
PORT = int(os.environ.get('PRUNE_PORT', '8780'))

RUNTIME = ['js', 'fill', 'solid', 'away', 'above', 'in', 'on', 'cur', 'scrolled', 'bar-off', 'pair-hover', 'ds-wait',
           'snap-center', 'lock', 'scroll-cue', 'h-links', 'barchart', 'pick', 'method-rows', 'method-row', 'prate-group', 'side-nav', 'toc-fab', 'top-fab', 'fab-stack', 'toc-pop', 'lightbox', 'lb-close',
           'lb-stage', 'lb-cap', 'sheet-end']
RUNTIME_RE = r'(?<![\w-])\.(?:' + '|'.join(re.escape(c) for c in RUNTIME) + r')(?![\w-])|(?<![\w-])\.(?:bc-[\w-]*|pick)(?![\w-])|\[|:(?:hover|focus|active|target|checked|disabled|focus-visible|focus-within|visited|placeholder-shown)|::(?:selection|placeholder|-webkit|-moz|marker)'

# ---- contexts: (w, h, hash, scroll) ----
HOME_DET = [(360,800),(480,850),(680,900),(681,900),(760,900),(900,900),(901,700),(1100,900),(1280,900),
            (1300,900),(1400,900),(1500,900),(1700,950),(900,500),(1100,680),(800,400)]
PROJ_DET = [(400,850,'#opencv'),(681,900,'#opencv'),(900,900,'#opencv'),(1100,780,'#opencv'),(1300,900,'#opencv'),
            (1450,900,'#opencv'),(400,850,'#plc'),(1100,900,'#vision'),(400,850,'#thesis'),(1100,900,'#thesis')]
DET = [(w, h, '', None) for w, h in HOME_DET] + [(w, h, s, None) for w, h, s in PROJ_DET]
# bisect/verify contexts: breakpoints on both sides, scroll states, every project
VER = [(w, h, '', None) for w, h in [(360,800),(560,900),(561,900),(680,900),(681,900),(761,900),(900,900),(901,900),(981,900),
                                      (1099,900),(1100,900),(1280,900),(1300,900),(1400,900),(1500,900),(1660,900),
                                      (900,500),(1100,680),(1100,820),(800,400),(640,360)]]
VER += [(w, h, '', 'mid') for w, h in [(400,850),(900,900),(1300,900)]] + [(w, h, '', 'end') for w, h in [(400,850),(1100,900)]]
VER += [(w, h, '#opencv', None) for w, h in [(400,850),(680,900),(681,900),(900,900),(1100,780),(1300,900),(1450,900),(900,500)]]
VER += [(w, h, '#opencv', 'mid') for w, h in [(400,850),(1100,900)]] + [(w, h, '#opencv', 'end') for w, h in [(400,850),(1100,900),(1300,900)]]
VER += [(w, h, '#' + p, None) for p in ['robot', 'vision', 'plc', 'thesis', 'travel'] for w, h in [(400,850),(1100,900)]]
FINAL_EXTRA = [(w, 900, h_, None) for w in (360, 480, 600, 768, 1024, 1280, 1440, 1920) for h_ in ('', '#opencv', '#plc', '#thesis')]

def key(c): return '%dx%d%s%s' % (c[0], c[1], c[2], '_' + c[3] if c[3] else '')

def start_server():
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '-d', str(DOCS)],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1); return srv

def open_ctx(b, ctx):
    w, h, hs, sc = ctx
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith('http://127.0.0.1') and not re.search(r'\.(mp4|webm|mov)(\?|$)', r.request.url) else r.abort())
    pg.goto(f'http://127.0.0.1:{PORT}/index.html?x={time.time()}{hs}')
    pg.wait_for_timeout(1500); pg.add_style_tag(content=FREEZE); pg.wait_for_timeout(200)
    if sc:
        pg.evaluate("""(sc) => { const sh = document.getElementById('sheet'); const open = sh && !sh.hidden;
          const el = open ? sh : document.scrollingElement; const max = el.scrollHeight - el.clientHeight;
          const y = sc === 'end' ? max : Math.round(max * 0.4); if (open) sh.scrollTop = y; else scrollTo(0, y); }""", sc)
        pg.wait_for_timeout(700)
    return pg

# ---------------- detection ----------------
DETECT_JS = r"""
([rulesIn, runtimeRe]) => {
  const RT = new RegExp(runtimeRe);
  const sheet = [...document.styleSheets].find(s => s.href && s.href.includes('app.css'));
  const rules = [];
  const walk = (list, ok) => { for (const r of list) {
    if (r instanceof CSSStyleRule) rules.push([r, ok]);
    else if (r instanceof CSSMediaRule) walk(r.cssRules, ok && matchMedia(r.conditionText).matches && !/print|reduced-motion/.test(r.conditionText));
    else if (r instanceof CSSSupportsRule) walk(r.cssRules, ok && CSS.supports(r.conditionText));
  } };
  walk(sheet.cssRules, true);
  if (rules.length !== rulesIn.length) return {error: 'rule count ' + rules.length + ' vs ' + rulesIn.length};
  const all = [...document.querySelectorAll('html, body, body *')];
  const sig = (e, ps) => { const c = getComputedStyle(e, ps); let s = ''; for (let i = 0; i < c.length; i++) s += c.getPropertyValue(c[i]) + '|'; return s; };
  const geo = () => { const a = new Float64Array(all.length * 6); let k = 0;
    for (const e of all) { const r = e.getBoundingClientRect(); a[k++] = r.x; a[k++] = r.y; a[k++] = r.width; a[k++] = r.height; a[k++] = e.scrollWidth; a[k++] = e.scrollHeight; } return a; };
  const geoSame = (a, b) => { for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.15) return false; return true; };
  const base = new Map();
  const get = e => { let b = base.get(e); if (!b) { b = [sig(e, null), sig(e, '::before'), sig(e, '::after')]; base.set(e, b); } return b; };
  const near = (a, b) => { if (a === b) return true; const ra = a.split(/(-?\d*\.?\d+)/), rb = b.split(/(-?\d*\.?\d+)/); if (ra.length !== rb.length) return false;
    for (let i = 0; i < ra.length; i++) { if (ra[i] === rb[i]) continue; if (i % 2 === 0) return false; if (Math.abs(parseFloat(ra[i]) - parseFloat(rb[i])) > 0.15) return false; } return true; };
  const same = e => { const b = get(e); return near(b[0], sig(e, null)) && near(b[1], sig(e, '::before')) && near(b[2], sig(e, '::after')); };
  const INH = /^(color|font|line-height|letter-spacing|word-|white-space|text-|visibility|list-style|cursor|direction|quotes|tab-size|hyphens|overflow-wrap|border-collapse|border-spacing|caption-side|pointer-events|-webkit-font|-webkit-text|font-variant|font-feature|writing-mode|fill|stroke|accent-color|caret-color|color-scheme|orphans|widows|image-rendering|paint-order)/;
  const SKIP = /^(--|-|transition|animation|scroll-behavior|will-change|touch-action|scroll-|overscroll|content-visibility|contain)/;
  const geo0 = geo();
  const dead = [], applicable = [];
  rules.forEach(([r, ok], ri) => {
    const decls = rulesIn[ri]; if (!ok || !decls.length) return;
    const sel = r.selectorText; if (RT.test(sel)) return;
    let els;
    try { els = [...new Set(sel.split(/,(?![^(]*\))/).flatMap(s => [...document.querySelectorAll(s.replace(/::?(before|after)/g, '').trim() || '*')]))]; } catch (e) { return; }
    if (!els.length) return;
    els.forEach(get);
    let cur = decls.slice();
    const props = decls.map(d => d.split(':')[0].trim().toLowerCase());
    for (let di = 0; di < decls.length; di++) {
      const d = decls[di]; const prop = props[di];
      if (SKIP.test(prop) || /!important/i.test(d) || props.filter(p => p === prop).length > 1) continue;
      applicable.push([ri, di]);
      const inh = INH.test(prop) || prop === 'all';
      let scope = els;
      if (inh) { scope = [...new Set(els.flatMap(e => [e, ...e.querySelectorAll('*')]))]; scope.forEach(get); }
      const idx = cur.indexOf(d); const t2 = cur.slice(0, idx).concat(cur.slice(idx + 1));
      r.style.cssText = t2.join(';');
      let okSame = true;
      for (const e of scope) { if (!same(e)) { okSame = false; break; } }
      if (okSame && !geoSame(geo0, geo())) okSame = false;
      if (okSame) { cur = t2; dead.push([ri, di]); } else { r.style.cssText = cur.join(';'); }
    }
  });
  return {dead, applicable};
}
"""

def parsed():
    original = CSS.read_text()
    tree = parse(strip_comments(original))
    return original, tree, flat_rules(tree)

def cmd_detect(part, nparts):
    (SCRATCH / 'det').mkdir(exist_ok=True)
    original, tree, rules = parsed(); rin = [list(r[2]) for r in rules]
    srv = start_server()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for n, ctx in enumerate(DET):
                if n % nparts != part: continue
                f = SCRATCH / 'det' / (key(ctx) + '.json')
                if f.exists(): print('cached', key(ctx), flush=True); continue
                t0 = time.time(); pg = open_ctx(b, ctx)
                res = pg.evaluate(DETECT_JS, [rin, RUNTIME_RE]); pg.close()
                if 'error' in res: raise SystemExit(res['error'])
                f.write_text(json.dumps(res)); print('detected', key(ctx), len(res['dead']), 'of', len(res['applicable']), round(time.time() - t0), 's', flush=True)
            b.close()
    finally: srv.kill()

# ---------------- combine (cumulative bisect, persistent pages) ----------------
PERSIST_JS = r"""
() => {
  const all = [...document.querySelectorAll('html, body, body *')];
  const index = new Map(all.map((e, i) => [e, i]));
  const link = [...document.querySelectorAll('link[rel=stylesheet]')].find(l => l.href.includes('app.css'));
  const P = window.__P = {all, index, link, st: null};
  const rnd = s => s.replace(/-?\d+\.\d+/g, m => String(Math.round(parseFloat(m) * 10) / 10));
  const hsh = s => { s = rnd(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h | 0; };
  const sig = (e, ps) => { const c = getComputedStyle(e, ps); let s = ''; for (let i = 0; i < c.length; i++) s += c.getPropertyValue(c[i]) + '|'; return s; };
  P.h1 = (e, ps) => hsh(sig(e, ps));
  P.hh = e => [hsh(sig(e, null)), hsh(sig(e, '::before')), hsh(sig(e, '::after'))];
  P.geo = () => { const a = new Float64Array(all.length * 6); let k = 0;
    for (const e of all) { const r = e.getBoundingClientRect(); a[k++] = r.x; a[k++] = r.y; a[k++] = r.width; a[k++] = r.height; a[k++] = e.scrollWidth; a[k++] = e.scrollHeight; } return a; };
  P.base = all.map(P.hh); P.geo0 = P.geo();
  P.setCss = css => { if (!P.st) { P.st = document.createElement('style'); link.after(P.st); link.remove(); } P.st.textContent = css; };
  P.scope = (shallow, deep) => { const s = new Map();
    const q = (sel, d) => { for (const part of sel.split(/,(?![^(]*\))/)) { const ps = /::?(before|after)/.test(part); let els; try { els = document.querySelectorAll(part.replace(/::?(before|after)/g, '').trim() || '*'); } catch (e) { continue; }
      const add = (e, flag) => { if (!index.has(e)) return; const i = index.get(e); s.set(i, (s.get(i) || false) || flag); };
      for (const e of els) { add(e, true); if (d) for (const c of e.querySelectorAll('*')) add(c, true); } } };
    shallow.forEach(x => q(x, false)); deep.forEach(x => q(x, true)); return s; };
  // compare: geometry of every element (+ scoped styles unless mode 'geo'). full -> every element, all pseudos
  P.check = (css, shallow, deep, full, mode) => {
    P.setCss(css);
    const g = P.geo(); for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - P.geo0[i]) > 0.5) return 'geo@' + all[Math.floor(i / 6)].tagName + '.' + String(all[Math.floor(i / 6)].className).slice(0, 30);
    if (mode === 'geo') return '';
    const sc = full ? new Map(all.map((_, i) => [i, true])) : P.scope(shallow, deep);
    for (const [i, ps] of sc) { const e = all[i], b = P.base[i];
      if (P.h1(e, null) !== b[0]) return 'style@' + e.tagName + '.' + String(e.className).slice(0, 30);
      if (ps && (P.h1(e, '::before') !== b[1] || P.h1(e, '::after') !== b[2])) return 'pseudo@' + e.tagName + '.' + String(e.className).slice(0, 30); }
    return '';
  };
  return all.length;
}
"""

class Pages:
    def __init__(self, b, ctxs):
        self.pages = []
        for c in ctxs:
            pg = open_ctx(b, c); n = pg.evaluate(PERSIST_JS); self.pages.append([c, pg, 0]); print('  page', key(c), n, flush=True)
    def check(self, css, shallow, deep, full=False, mode=''):
        self.pages.sort(key=lambda x: -x[2])
        for ent in self.pages:
            r = ent[1].evaluate('([c, s, d, f, m]) => window.__P.check(c, s, d, f, m)', [css, shallow, deep, full, mode])
            if r: ent[2] += 1; return (key(ent[0]), r)
        return None

SEL_STRIP = re.compile(r'::?(before|after)')
INH_RE = re.compile(r'^(color|font|line-height|letter-spacing|word-|white-space|text-|visibility|list-style|cursor|direction|quotes|tab-size|hyphens|overflow-wrap|border-collapse|border-spacing|caption-side|pointer-events|font-variant|font-feature|writing-mode|fill|stroke|accent-color|caret-color|color-scheme|orphans|widows|image-rendering|paint-order)')

def cmd_combine():
    original, tree, rules = parsed(); rin = [list(r[2]) for r in rules]
    status = {}
    for ctx in DET:
        f = SCRATCH / 'det' / (key(ctx) + '.json')
        if not f.exists(): raise SystemExit('missing detection for ' + key(ctx))
        res = json.loads(f.read_text()); d = {tuple(x) for x in res['dead']}
        for k in map(tuple, res['applicable']): status[k] = status.get(k, True) and (k in d)
    cands = sorted(k for k, v in status.items() if v)
    print('candidates', len(cands), 'applicable', len(status), 'total decls', sum(len(x) for x in rin), flush=True)
    def build(kset):
        for ri, r in enumerate(rules): r[2][:] = [d for di, d in enumerate(rin[ri]) if (ri, di) not in kset]
        return emit(tree)
    def scopes(ks):
        sh, dp = set(), set()
        for ri, di in ks:
            sels = [SEL_STRIP.sub('', s).strip() for s in split_top(rules[ri][1], ',')]
            prop = rin[ri][di].split(':')[0].strip().lower()
            (dp if INH_RE.match(prop) else sh).update(sels)
        return sorted(sh), sorted(dp)
    srv = start_server()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(); pages = Pages(b, VER)
            r = pages.check(emit(parse(strip_comments(original))), [], [], mode='geo')
            assert r is None, 're-emit changes output: %s' % (r,)
            print('re-emit ok on all contexts', flush=True)
            calls = [0]
            by_rule = {}
            for k in cands: by_rule.setdefault(k[0], []).append(k)
            groups = [by_rule[r] for r in sorted(by_rule)]
            def bisect(gs, base, test):
                keep = set(base)
                def solve(gs):
                    flat = [k for g in gs for k in g]
                    if not flat: return
                    calls[0] += 1
                    if test(keep | set(flat), set(flat)): keep.update(flat); print('  accepted', len(flat), 'kept', len(keep), 'calls', calls[0], flush=True); return
                    if len(gs) == 1:
                        g = gs[0]
                        if len(g) > 1:
                            for k in g: solve([[k]])
                        return
                    m = len(gs) // 2; solve(gs[:m]); solve(gs[m:])
                solve(gs); return keep
            geo_ok = lambda ks, new: pages.check(build(ks), [], [], mode='geo') is None
            def style_ok(ks, new):
                sh, dp = scopes(new); return pages.check(build(ks), sh, dp) is None
            keep = bisect(groups, set(), geo_ok)
            print('stage 1 (geometry) kept', len(keep), 'of', len(cands), flush=True)
            if not style_ok(keep, keep):
                br = {}
                for k in sorted(keep): br.setdefault(k[0], []).append(k)
                keep = bisect([br[r] for r in sorted(br)], set(), style_ok)
            print('stage 2 (styles) kept', len(keep), flush=True)
            print('after bisect', len(keep), 'of', len(cands), 'calls', calls[0], flush=True)
            # full-scope confirmation of the cumulative result on every page (style of all elements + geometry)
            r = pages.check(build(keep), [], [], full=True)
            print('full-scope check of result:', r or 'ok', flush=True)
            if r:
                raise SystemExit('cumulative result differs; not writing candidate')
            (SCRATCH / 'keep.json').write_text(json.dumps(sorted(keep)))
            (SCRATCH / 'candidate.css').write_text(build(keep) + '\n')
            print('wrote candidate.css', flush=True)
            b.close()
    finally: srv.kill()

# ---------------- final strict verification ----------------
def cmd_final(part, nparts):
    (SCRATCH / 'fin').mkdir(exist_ok=True)
    css = (SCRATCH / 'candidate.css').read_text()
    ctxs = VER + FINAL_EXTRA
    srv = start_server()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            for n, ctx in enumerate(ctxs):
                if n % nparts != part: continue
                f = SCRATCH / 'fin' / (key(ctx) + '.json')
                if f.exists(): print('cached', key(ctx), flush=True); continue
                t0 = time.time(); pg = open_ctx(b, ctx)
                r = pg.evaluate(VERIFY_JS, css); pg.close()
                f.write_text(json.dumps(r)); print('final', key(ctx), r, round(time.time() - t0), 's', flush=True)
            b.close()
    finally: srv.kill()

def cmd_report():
    bad, n = [], 0
    for ctx in VER + FINAL_EXTRA:
        f = SCRATCH / 'fin' / (key(ctx) + '.json')
        if not f.exists(): print('MISSING', key(ctx)); bad.append(key(ctx)); continue
        n += 1; r = json.loads(f.read_text())
        if r['n']: print('DIFF', key(ctx), r); bad.append(key(ctx))
    print('contexts checked', n, 'bad', len(bad))

if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'detect': cmd_detect(int(sys.argv[2]), int(sys.argv[3]))
    elif c == 'combine': cmd_combine()
    elif c == 'final': cmd_final(int(sys.argv[2]), int(sys.argv[3]))
    elif c == 'report': cmd_report()


# ---------------- transplant: re-apply a verified removal set to a newer stylesheet ----------------
def _chained(tree, chain=()):
    for it in tree:
        if it[0] == 'rule': yield chain, it
        elif it[0] == 'at': yield from _chained(it[2], chain + (it[1],))

def cmd_transplant(old_css, new_css, out):
    """keep.json refers to rules of `old_css`. Remove the same declarations from the rule with the same
    (media chain, selector, occurrence number) in `new_css` - only when that rule still has the identical declaration.
    Everything else (new rules, changed declarations) is left as is. The result must be verified with `final`."""
    keep = [tuple(x) for x in json.loads((SCRATCH / 'keep.json').read_text())]
    otree = parse(strip_comments(Path(old_css).read_text())); ntree = parse(strip_comments(Path(new_css).read_text()))
    orules = flat_rules(otree); occ = {}
    def occ_index(lst):
        seen, res = {}, []
        for chain, r in lst:
            k = (chain, r[1]); n = seen.get(k, 0); seen[k] = n + 1; res.append((k, n, r))
        return res
    o_idx = occ_index(list(_chained(otree))); n_idx = {(k, n): r for k, n, r in occ_index(list(_chained(ntree)))}
    # flat_rules order == _chained order
    assert [r for _, _, r in o_idx] == orules or len(o_idx) == len(orules)
    drop, applied, skipped = {}, 0, 0
    for ri, di in keep:
        k, n, r = o_idx[ri]; decl = r[2][di]
        tr = n_idx.get((k, n))
        if tr is None or decl not in tr[2]: skipped += 1; continue
        drop.setdefault(id(tr), (tr, set()))[1].add(decl); applied += 1
    for tr, ds in drop.values(): tr[2][:] = [d for d in tr[2] if d not in ds]
    Path(out).write_text(emit(ntree) + '\n')
    print('applied', applied, 'skipped', skipped, '->', out)

if __name__ == '__main__' and sys.argv[1] == 'transplant':
    cmd_transplant(sys.argv[2], sys.argv[3], sys.argv[4])
