"""Remove declarations and rules in docs/app.css that never change what the page renders.

For every declaration, the page is loaded at many viewport sizes (home and with a project open),
the declaration is removed in place, and the computed styles of the affected elements are compared
with the untouched page. Only declarations that make no difference anywhere are dropped.
Kept as-is: anything in rules with state pseudo-classes, transitions/animations, custom properties,
print/reduced-motion media, and rules that match nothing in the tested pages but use classes that
appear in index.html or app.js.
"""
import json, re, subprocess, sys, time, hashlib
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / 'docs' / 'app.css'
VIEWS = [(360,800),(400,850),(520,900),(640,900),(720,900),(800,900),(950,900),(1040,900),(1090,900),
         (1200,900),(1290,900),(1350,900),(1450,900),(1550,900),(1700,950),
         (900,500),(1200,500),(1200,700),(1200,780),(1200,850),(800,400),(640,360)]
STATES = ['', '#opencv']

def strip_comments(t):
    return re.sub(r'/\*.*?\*/', lambda m: ' ' * 0 if '\n' not in m.group(0) else '\n' * m.group(0).count('\n'), t, flags=re.S)

def split_top(s, sep):
    out, depth, cur, q = [], 0, [], None
    for ch in s:
        if q:
            cur.append(ch)
            if ch == q: q = None
            continue
        if ch in '"\'': q = ch; cur.append(ch); continue
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == sep and depth == 0: out.append(''.join(cur)); cur = []
        else: cur.append(ch)
    out.append(''.join(cur))
    return out

def parse(t):
    """Return a tree: list of ('rule', selector, [decls]) | ('at', prelude, children) | ('raw', text)."""
    i, n = 0, len(t)
    def block(end_at_brace):
        nonlocal i
        items = []
        while i < n:
            while i < n and t[i].isspace(): i += 1
            if i >= n: break
            if t[i] == '}':
                if end_at_brace: i += 1; return items
                i += 1; continue
            j = i; q = None; depth = 0
            while j < n:
                ch = t[j]
                if q:
                    if ch == q: q = None
                elif ch in '"\'': q = ch
                elif ch in '([': depth += 1
                elif ch in ')]': depth -= 1
                elif ch in '{;' and depth == 0: break
                j += 1
            prelude = t[i:j].strip()
            if j >= n or t[j] == ';':
                items.append(('raw', prelude + ';')); i = j + 1; continue
            i = j + 1
            if prelude.startswith('@media') or prelude.startswith('@supports'):
                items.append(('at', prelude, block(True)))
            elif prelude.startswith('@'):
                d, k = 1, i
                while k < n and d:
                    if t[k] == '{': d += 1
                    elif t[k] == '}': d -= 1
                    k += 1
                items.append(('raw', prelude + ' {' + t[i:k-1].strip() + ' }')); i = k
            else:
                k = i; q = None
                while k < n:
                    ch = t[k]
                    if q:
                        if ch == q: q = None
                    elif ch in '"\'': q = ch
                    elif ch == '}': break
                    k += 1
                decls = [d.strip() for d in split_top(t[i:k], ';') if d.strip()]
                items.append(('rule', prelude, decls)); i = k + 1
        return items
    return block(False)

def flat_rules(tree, acc=None):
    acc = [] if acc is None else acc
    for it in tree:
        if it[0] == 'rule': acc.append(it)
        elif it[0] == 'at': flat_rules(it[2], acc)
    return acc

def emit(tree, ind=''):
    out = []
    for it in tree:
        if it[0] == 'raw': out.append(ind + it[1])
        elif it[0] == 'rule':
            if it[2]: out.append(f"{ind}{it[1]} {{ {'; '.join(it[2])}; }}")
        else:
            inner = emit(it[2], ind + '  ')
            if inner.strip(): out.append(f"{ind}{it[1]} {{\n{inner}\n{ind}}}")
    return '\n'.join(out)

PAGE_JS = r"""
(rulesIn) => {
  const sheet = [...document.styleSheets].find(s => s.href && s.href.includes('app.css'));
  const rules = [];
  const walk = (list, ok) => { for (const r of list) {
    if (r instanceof CSSStyleRule) rules.push([r, ok]);
    else if (r instanceof CSSMediaRule) walk(r.cssRules, ok && matchMedia(r.conditionText).matches && !/print|reduced-motion/.test(r.conditionText));
    else if (r instanceof CSSSupportsRule) walk(r.cssRules, ok && CSS.supports(r.conditionText));
  } };
  walk(sheet.cssRules, true);
  if (rules.length !== rulesIn.length) return {error: 'rule count ' + rules.length + ' vs ' + rulesIn.length};
  const sig = (e, ps) => { const c = getComputedStyle(e, ps); let s = ''; for (let i = 0; i < c.length; i++) s += c.getPropertyValue(c[i]) + '|'; return s; };
  const base = new Map();
  const get = e => { let b = base.get(e); if (!b) { b = [sig(e, null), sig(e, '::before'), sig(e, '::after')]; base.set(e, b); } return b; };

  const near = (a, b) => { if (a === b) return true; const ra = a.split(/(-?\d*\.?\d+)/), rb = b.split(/(-?\d*\.?\d+)/); if (ra.length !== rb.length) return false;
    for (let i = 0; i < ra.length; i++) { if (ra[i] === rb[i]) continue; if (i % 2 === 0) return false; if (Math.abs(parseFloat(ra[i]) - parseFloat(rb[i])) > 0.15) return false; } return true; };
  const same = e => { const b = get(e); return near(b[0], sig(e, null)) && near(b[1], sig(e, '::before')) && near(b[2], sig(e, '::after')); };
  const STATE = /:(hover|focus|active|target|checked|disabled|focus-visible|focus-within|visited|placeholder-shown)|::(selection|placeholder|-webkit|-moz|marker)/;
  const INH = /^(color|font|line-height|letter-spacing|word-|white-space|text-|visibility|list-style|cursor|direction|quotes|tab-size|hyphens|overflow-wrap|border-collapse|border-spacing|caption-side|pointer-events|-webkit-font|-webkit-text|font-variant|font-feature|writing-mode)/;
  const SKIP = /^(--|transition|animation|scroll-behavior|will-change|-webkit-tap|-webkit-overflow|touch-action|scroll-|overscroll|content-visibility|contain)/;
  const dead = [], applicable = [];
  rules.forEach(([r, ok], ri) => {
    const decls = rulesIn[ri]; if (!ok || !decls.length) return;
    const sel = r.selectorText; if (STATE.test(sel)) return;
    let els;
    try { els = [...new Set(sel.split(/,(?![^(]*\))/).flatMap(s => [...document.querySelectorAll(s.replace(/::?(before|after)/g, '').trim() || '*')]))]; } catch (e) { return; }
    if (!els.length) return;
    els.forEach(get);
    let cur = decls.slice();
    for (let di = 0; di < decls.length; di++) {
      const d = decls[di]; const prop = d.split(':')[0].trim().toLowerCase();
      if (SKIP.test(prop)) continue;
      applicable.push([ri, di]);
      const inh = INH.test(prop) || prop === 'all';
      let scope = els;
      if (inh) { scope = [...new Set(els.flatMap(e => [e, ...e.querySelectorAll('*')]))]; scope.forEach(get); }
      const trial = cur.filter(x => x !== d || false);
      const idx = cur.indexOf(d); const t2 = cur.slice(0, idx).concat(cur.slice(idx + 1));
      r.style.cssText = t2.join(';');
      let okSame = true;
      for (const e of scope) { if (!same(e)) { okSame = false; break; } }
      if (okSame) { cur = t2; dead.push([ri, di]); } else { r.style.cssText = cur.join(';'); }
    }
  });
  return {dead, applicable};
}
"""
VERIFY_JS = r"""
async (css) => {
  const near = (a, b) => { if (a === b) return true; const ra = a.split(/(-?\d*\.?\d+)/), rb = b.split(/(-?\d*\.?\d+)/); if (ra.length !== rb.length) return false;
    for (let i = 0; i < ra.length; i++) { if (ra[i] === rb[i]) continue; if (i % 2 === 0) return false; if (Math.abs(parseFloat(ra[i]) - parseFloat(rb[i])) > 0.15) return false; } return true; };

  const sig = (e, ps) => { const c = getComputedStyle(e, ps); let s = ''; for (let i = 0; i < c.length; i++) s += c.getPropertyValue(c[i]) + '|'; return s; };
  const els = [...document.querySelectorAll('html, body, body *')];
  const base = els.map(e => [sig(e, null), sig(e, '::before'), sig(e, '::after')]);
  const link = [...document.querySelectorAll('link[rel=stylesheet]')].find(l => l.href.includes('app.css'));
  const st = document.createElement('style'); st.textContent = css; link.after(st); link.remove();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  let n = 0; const ex = [];
  els.forEach((e, i) => { const b = base[i]; if (!(near(b[0], sig(e, null)) && near(b[1], sig(e, '::before')) && near(b[2], sig(e, '::after')))) { n++; if (ex.length < 3) ex.push(e.tagName + '.' + String(e.className).slice(0, 40)); } });
  return {n, ex};
}
"""
FREEZE = "*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}"

def open_page(b, port, w, h, state):
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.goto(f'http://127.0.0.1:{port}/index.html?x={time.time()}{state}')
    pg.wait_for_timeout(1500); pg.add_style_tag(content=FREEZE); pg.wait_for_timeout(200)
    return pg

CTX = [(w, h, '') for (w, h) in VIEWS] + [(w, h, '#opencv') for (w, h) in [(400,850),(720,900),(950,900),(1200,900),(1450,900),(1700,950)]]

def verify(b, port, css, ctxs=None):
    """Contexts where swapping in `css` changes any computed style (the file on disk must be the original)."""
    bad = []
    for (w, h, st) in (ctxs or CTX):
        pg = open_page(b, port, w, h, st)
        r = pg.evaluate(VERIFY_JS, css); pg.close()
        if r['n']: bad.append((w, h, st)); print('   differs', (w, h, st), r, flush=True)
    return bad

def main():
    port = 8771
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(port), '-d', str(ROOT / 'docs')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    original = CSS.read_text()
    out_path = ROOT / 'docs' / 'app.pruned.css'
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            tree = parse(strip_comments(original))
            assert not verify(b, port, emit(tree)), 're-emitting the stylesheet changed output'
            print('re-emit ok', flush=True)
            rules = flat_rules(tree); rin = [list(r[2]) for r in rules]
            status = {}
            for n, (w, h, st) in enumerate(CTX):
                t0 = time.time(); pg = open_page(b, port, w, h, st)
                res = pg.evaluate(PAGE_JS, rin); pg.close()
                if 'error' in res: raise SystemExit(res['error'])
                d = {tuple(x) for x in res['dead']}
                for k in map(tuple, res['applicable']): status[k] = status.get(k, True) and (k in d)
                print(' ctx', n + 1, '/', len(CTX), (w, h, st), 'dead so far', sum(status.values()), round(time.time() - t0), 's', flush=True)
            kill = {k for k, v in status.items() if v}
            def build(kset):
                for ri, r in enumerate(rules): r[2][:] = [d for di, d in enumerate(rin[ri]) if (ri, di) not in kset]
                return emit(tree)
            bad = verify(b, port, build(kill))
            print('candidates', len(kill), 'of', sum(len(x) for x in rin), 'mismatching contexts', len(bad), flush=True)
            if bad:
                by_rule = {}
                for (ri, di) in sorted(kill): by_rule.setdefault(ri, set()).add((ri, di))
                groups = [v for _, v in sorted(by_rule.items())]
                keep = set()
                def bis(gs):
                    cur = set().union(*gs) if gs else set()
                    if not cur: return
                    if not verify(b, port, build(keep | cur), bad): keep.update(cur); return
                    if len(gs) == 1: return
                    m = len(gs) // 2; bis(gs[:m]); bis(gs[m:])
                bis(groups); kill = keep
                assert not verify(b, port, build(kill)), 'still differs after bisect'
                print('after bisect', len(kill), flush=True)
            css = build(kill)
            html = (ROOT / 'docs' / 'index.html').read_text() + (ROOT / 'docs' / 'app.js').read_text()
            def unused(sel):
                return any(not re.search(r'(?<![\w-])' + re.escape(c) + r'(?![\w-])', html) for c in re.findall(r'\.(-?[A-Za-z_][\w-]*)', sel))
            n_unused = 0
            for r in flat_rules(tree):
                parts = [x.strip() for x in split_top(r[1], ',')]
                kp = [x for x in parts if not unused(x)]
                if len(kp) != len(parts):
                    n_unused += len(parts) - len(kp)
                    if kp: tree_replace(tree, r, ('rule', ', '.join(kp), r[2]))
                    else: r[2][:] = []
            css2 = emit(tree)
            if verify(b, port, css2): print('unused-selector removal changed output; skipped', flush=True)
            else: css = css2; print('unused selectors removed', n_unused, flush=True)
            out_path.write_text(css + '\n')
            print('written', out_path, len(original), '->', len(css), flush=True)
            b.close()
    finally:
        srv.kill()

def tree_replace(tree, old, new):
    for i, it in enumerate(tree):
        if it is old: tree[i] = new; return True
        if it[0] == 'at' and tree_replace(it[2], old, new): return True
    return False

if __name__ == '__main__':
    main()
