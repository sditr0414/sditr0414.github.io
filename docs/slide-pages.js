/* Break only over-height detail cards into readable, natural-height continuations.
   Original nodes are moved, not rewritten, so media, links and source content survive. */
function createSlidePages(sheet) {
  const records = new WeakMap();
  const cleanClone = node => {
    const clone = node.cloneNode(true);
    [clone, ...clone.querySelectorAll('[id]')].forEach(el => el.removeAttribute('id'));
    return clone;
  };
  const shell = node => { const copy = node.cloneNode(false); copy.removeAttribute('id'); return copy; };
  const height = el => el.getBoundingClientRect().height;
  function remember(art) {
    return [...art.querySelectorAll('section.ds[id]')].map(sec => {
      const body = sec.querySelector('.ds-body');
      const tree = [body, ...body.querySelectorAll('*')].map(node => [node, [...node.childNodes]]);
      return { sec, body, tree, classes: sec.className, style: sec.getAttribute('style'), parts: [], label: art.querySelector(`[data-to="${sec.id}"]`)?.textContent || sec.id };
    });
  }
  function restore(r) {
    r.parts.forEach(part => part.remove()); r.parts = [];
    r.sec.querySelectorAll(':scope > .page-part-count').forEach(el => el.remove());
    r.sec.className = r.classes;
    if (r.style === null) r.sec.removeAttribute('style'); else r.sec.setAttribute('style', r.style);
    r.tree.forEach(([node, children]) => node.replaceChildren(...children));
  }
  // Each returned unit retains enough of its original wrapper for its semantics and style.
  function divide(unit) {
    const node = unit.node;
    const table = node.matches('table') ? node : node.children.length === 1 && node.firstElementChild?.matches('table') ? node.firstElementChild : null;
    if (table && table.tBodies.length) {
      const rows = [...table.tBodies].flatMap(body => [...body.rows]);
      if (rows.length > 1) {
        const originalHead = table.tHead, headCopy = originalHead && cleanClone(originalHead);
        const originalCaption = table.caption, captionCopy = originalCaption && cleanClone(originalCaption);
        return rows.map((row, i) => {
          const t = shell(table), tbody = document.createElement('tbody');
          if (originalCaption) t.append(i === 0 ? originalCaption : cleanClone(captionCopy));
          if (originalHead) t.append(i === 0 ? originalHead : cleanClone(headCopy));
          tbody.append(row); t.append(tbody);
          const wrapper = node === table ? t : shell(node);
          if (wrapper !== t) wrapper.append(t);
          wrapper.classList.add('page-unit');
          return { node: wrapper, key: table, appendTo: tbody, item: row };
        });
      }
    }
    const children = [...node.children];
    if (children.length < 2) {
      if (children.length === 1 && (!node.matches('figure,a,video,svg,table') || (node.matches('figure') && children[0].matches('.app-screens,.fig-grid')))) return divide({ node: children[0] });
      return null;
    }
    if (node.matches('.split,.col,.slide-body,.overview-copy')) {
      return children.sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order)).map(child => ({ node: child }));
    }
    if (node.matches('figure') && !node.querySelector('.app-screens,.fig-grid')) return null;
    // Keep a subheading with each separated explanation, rather than stranding it.
    const heading = children[0].matches('h3,h4,h5') ? children[0] : null;
    const items = heading ? children.slice(1) : children;
    if (items.length < 2 && !heading) return null;
    const headingCopy = heading && cleanClone(heading);
    return items.map((child, i) => {
      const wrapper = shell(node); wrapper.classList.add('page-unit');
      if (heading) wrapper.append(i === 0 ? heading : cleanClone(headingCopy));
      wrapper.append(child);
      if (node.matches('ol')) wrapper.start = i + (node.start || 1);
      return { node: wrapper, key: node, appendTo: wrapper, item: child };
    });
  }
  function prepare(art, force = false) {
    if (!art || art.hidden || sheet.hidden) return;
    let state = records.get(art);
    if (!state) { state = { originals: remember(art), size: '' }; records.set(art, state); }
    const size = `${sheet.clientWidth}:${sheet.clientHeight}`;
    if (state.size === size && !force) return;
    state.size = size;
    // Short landscape phone screens: keep every slide whole and let it scroll naturally instead of cutting it into tiny parts.
    if (sheet.clientHeight < 470) { state.originals.forEach(restore); sheet.dispatchEvent(new CustomEvent('detailpageschange', { detail: { article: art } })); return; }
    const bar = sheet.querySelector('.sheet-bar').offsetHeight;
    const limit = Math.max(180, sheet.clientHeight - bar - 32);
    for (const r of state.originals) {
      restore(r);
      const { sec, body } = r;
      if (height(sec) <= limit + 1) continue;
      sec.classList.add('page-media-fit');
      const headerHeight = sec.querySelector('.ds-head') ? height(sec.querySelector('.ds-head')) : 0;
      sec.style.setProperty('--page-media-max', Math.max(72, Math.min(440, limit - headerHeight - 130)) + 'px');
      sec.style.setProperty('--page-video-max', Math.max(72, limit - headerHeight - 90) + 'px');
      if (height(sec) <= limit + 1) continue;
      sec.classList.add('page-fragment');
      if (height(sec) <= limit + 1) continue;
      let current = sec, target = body, previous = null;
      const pages = [sec], queue = [...body.children].map(node => ({ node, depth: 0 }));
      body.replaceChildren();
      function nextPage() {
        const page = shell(sec); page.id = `${sec.id}-part-${pages.length + 1}`;
        page.dataset.pageOrigin = sec.id;
        const head = sec.querySelector('.ds-head');
        if (head) { const copy = cleanClone(head); copy.querySelector('.ds-deck')?.remove(); page.append(copy); }
        else { const label = document.createElement('p'); label.className = 'continuation-label'; label.textContent = r.label; page.append(label); }
        const nextBody = shell(body); page.append(nextBody); current.after(page);
        r.parts.push(page); pages.push(page); current = page; target = nextBody; previous = null;
      }
      while (queue.length) {
        const unit = queue.shift();
        const merge = previous && unit.key && previous.key === unit.key;
        if (merge) previous.appendTo.append(unit.item); else target.append(unit.node);
        if (height(current) <= limit + 1) { if (!merge) previous = unit; continue; }
        if (merge) unit.appendTo.append(unit.item); else unit.node.remove();
        if (target.children.length) { nextPage(); queue.unshift(unit); continue; }
        // The unit is too large on its own: break lists, rows or columns, never hide text.
        target.append(unit.node);
        const pieces = unit.depth < 10 ? divide(unit) : null;
        unit.node.remove();
        if (pieces?.length) queue.unshift(...pieces.map(piece => ({ ...piece, depth: (unit.depth || 0) + 1 })));
        else { target.append(unit.node); previous = unit; }
      }
      if (pages.length > 1) pages.forEach((page, i) => {
        page.dataset.pageOrigin = sec.id;
        const count = document.createElement('p'); count.className = 'page-part-count';
        count.textContent = `${i + 1} / ${pages.length}`; count.setAttribute('aria-label', `${r.label}, ${pages.length}쪽 중 ${i + 1}쪽`);
        page.prepend(count);
      });
    }
    sheet.dispatchEvent(new CustomEvent('detailpageschange', { detail: { article: art } }));
  }
  let refresh = 0;
  const refreshOverflow = event => {
    if (!event.target.matches('img,video')) return;
    const art = event.target.closest('.dv');
    if (!art || art.hidden) return;
    const limit = sheet.clientHeight - sheet.querySelector('.sheet-bar').offsetHeight - 32;
    if (![...art.querySelectorAll('.ds')].some(sec => height(sec) > limit + 2)) return;
    cancelAnimationFrame(refresh);
    refresh = requestAnimationFrame(() => { refresh = 0; prepare(art, true); });
  };
  sheet.addEventListener('load', refreshOverflow, true);
  sheet.addEventListener('loadedmetadata', refreshOverflow, true);
  return { prepare };
}
