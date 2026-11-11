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
  const same = e => { const b = get(e); return b[0] === sig(e, null) && b[1] === sig(e, '::before') && b[2] === sig(e, '::after'); };
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
FULL_JS = r"""() => { let s=''; for (const e of document.querySelectorAll('html, body, body *')) for (const ps of [null,'::before','::after']) { const c=getComputedStyle(e,ps); for (let i=0;i<c.length;i++) s+=c.getPropertyValue(c[i])+'|'; } return s; }"""
FREEZE = "*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}"

def open_page(b, port, w, h, state):
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.goto(f'http://127.0.0.1:{port}/index.html?x={time.time()}{state}')
    pg.wait_for_timeout(1500); pg.add_style_tag(content=FREEZE); pg.wait_for_timeout(200)
    return pg

def fingerprint(b, port):
    out = {}
    for (w, h) in VIEWS:
        for st in STATES:
            pg = open_page(b, port, w, h, st)
            out[(w, h, st)] = hashlib.sha1(pg.evaluate(FULL_JS).encode()).hexdigest(); pg.close()
    return out

def main():
    port = 8771
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(port), '-d', str(ROOT / 'docs')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    original = CSS.read_text()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            tree = parse(strip_comments(original))
            base = fingerprint(b, port)
            CSS.write_text(emit(tree) + '\n')
            chk = fingerprint(b, port); assert all(base[k] == chk[k] for k in base), 're-emitting the stylesheet changed output'
            print('contexts', len(base), flush=True)
            html = (ROOT / 'docs' / 'index.html').read_text() + (ROOT / 'docs' / 'app.js').read_text()
            for rnd in range(2):
                rules = flat_rules(tree); rin = [r[2] for r in rules]
                dead_all, appl_all = None, set()
                for (w, h) in VIEWS:
                    for st in STATES:
                        pg = open_page(b, port, w, h, st)
                        res = pg.evaluate(PAGE_JS, rin); pg.close()
                        if 'error' in res: raise SystemExit(res['error'])
                        d = {tuple(x) for x in res['dead']}; a = {tuple(x) for x in res['applicable']}
                        # dead everywhere it applies: track survivors
                        if dead_all is None: dead_all = {}
                        for k in a: dead_all[k] = dead_all.get(k, True) and (k in d)
                        appl_all |= a
                    print(' view', w, h, 'dead so far', sum(dead_all.values()), flush=True)
                kill = {k for k, v in dead_all.items() if v}
                # apply, then verify; restore offenders per failing context by re-testing
                def apply(kset):
                    for ri, r in enumerate(rules):
                        keep = [d for di, d in enumerate(rin[ri]) if (ri, di) not in kset]
                        r[2][:] = keep
                saved = [list(x) for x in rin]
                apply(kill); CSS.write_text(emit(tree) + '\n')
                now = fingerprint(b, port)
                bad = [k for k in base if base[k] != now[k]]
                print('round', rnd, 'removed', len(kill), 'mismatching contexts', len(bad), flush=True)
                if bad:
                    # conservative: restore everything removed this round, then re-remove one rule-group at a time
                    for ri, r in enumerate(rules): r[2][:] = saved[ri]
                    by_rule = {}
                    for (ri, di) in sorted(kill): by_rule.setdefault(ri, set()).add(di)
                    accepted = 0
                    items = sorted(by_rule.items())
                    def test(group):
                        snap = {ri: list(rules[ri][2]) for ri, _ in group}
                        for ri, dis in group: rules[ri][2][:] = [d for di, d in enumerate(saved[ri]) if di not in dis and d in rules[ri][2]]
                        CSS.write_text(emit(tree) + '\n')
                        ok = all(base[k] == v for k, v in fingerprint_subset(b, port, bad).items())
                        if not ok:
                            for ri, _ in group: rules[ri][2][:] = snap[ri]
                        return ok
                    def bisect(group):
                        nonlocal accepted
                        if not group: return
                        if test(group): accepted += sum(len(d) for _, d in group); return
                        if len(group) == 1: return
                        m = len(group) // 2; bisect(group[:m]); bisect(group[m:])
                    bisect(items)
                    CSS.write_text(emit(tree) + '\n')
                    now = fingerprint(b, port); assert all(base[k] == now[k] for k in base), 'still differs'
                    print('  recovered by bisect, removed', accepted, flush=True)
                    if accepted == 0: break
                elif not kill: break
            # rules whose classes appear nowhere in the page or script
            def unused(sel):
                cls = re.findall(r'\.(-?[A-Za-z_][\w-]*)', sel)
                return any(not re.search(r'(?<![\w-])' + re.escape(c) + r'(?![\w-])', html) for c in cls)
            n_unused = 0
            for r in flat_rules(tree):
                parts = [s.strip() for s in split_top(r[1], ',')]
                keep = [s for s in parts if not unused(s)]
                if len(keep) != len(parts):
                    n_unused += len(parts) - len(keep)
                    if keep: tree_replace(tree, r, ('rule', ', '.join(keep), r[2]))
                    else: r[2][:] = []
            CSS.write_text(emit(tree) + '\n')
            now = fingerprint(b, port); assert all(base[k] == now[k] for k in base), 'unused-rule removal changed output'
            print('unused selectors removed', n_unused)
            b.close()
    except BaseException:
        CSS.write_text(original); raise
    finally:
        srv.kill()

def fingerprint_subset(b, port, keys):
    out = {}
    for (w, h, st) in keys:
        pg = open_page(b, port, w, h, st); out[(w, h, st)] = hashlib.sha1(pg.evaluate(FULL_JS).encode()).hexdigest(); pg.close()
    return out

def tree_replace(tree, old, new):
    for i, it in enumerate(tree):
        if it is old: tree[i] = new; return True
        if it[0] == 'at' and tree_replace(it[2], old, new): return True
    return False

if __name__ == '__main__':
    main()
