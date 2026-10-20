(() => {
'use strict';
document.documentElement.classList.add('js');
const saveData = !!(navigator.connection && navigator.connection.saveData);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const hasIO = 'IntersectionObserver' in window;
/* things that follow the page position; called in the same frame a script moves the page, so nothing lags a frame behind */
let followScroll = () => {};
/* a scroll position that moves by one continuous curve: a new target keeps the current speed,
   so the motion never jerks, and it settles without a long creeping tail */
function makeGlider(read, write) {
  let raf = 0, p0 = 0, v0 = 0, p1 = 0, T = 1, t0 = 0, pos = 0, vel = 0, last = 0;
  const frame = now => {
    last = now;
    const t = Math.min(1, Math.max(0, (now - t0) / T)), t2 = t * t, t3 = t2 * t;
    pos = (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * T * v0 + (-2 * t3 + 3 * t2) * p1;
    vel = ((6 * t2 - 6 * t) * p0 + (3 * t2 - 4 * t + 1) * T * v0 + (-6 * t2 + 6 * t) * p1) / T;
    if (t >= 1) { pos = p1; vel = 0; }
    write(pos);
    raf = t < 1 ? requestAnimationFrame(frame) : 0;
  };
  return {
    to(y, ms) {
      if (!raf) { pos = read(); vel = 0; }
      const d = y - pos;
      /* time from the last drawn frame, so the very next frame already moves */
      p0 = pos; p1 = y; T = Math.max(60, ms); t0 = raf ? last : performance.now() - 8;
      if (Math.abs(d) < .5) { cancelAnimationFrame(raf); raf = 0; vel = 0; write(y); return; }
      /* start briskly, keep any speed already in the same direction, never overshoot */
      let v = vel * d > 0 ? vel : 0;
      if (Math.abs(v) < .05) v = 1.3 * d / T;   // from rest: a brisk start; already moving: carry on at the same speed
      if (Math.abs(v) > 2.6 * Math.abs(d) / T) v = 2.6 * d / T;
      v0 = v;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() { cancelAnimationFrame(raf); raf = 0; vel = 0; },
    get active() { return !!raf; },
    get target() { return p1; }
  };
}

/* header: transparent over the cover, solid after it */
const top = $('.top'), hero = $('.hero');
const onScroll = () => top.classList.toggle('solid', scrollY > hero.offsetHeight - 60);
addEventListener('scroll', onScroll, { passive: true }); onScroll();

/* cover fills the first screen on tall desktops: measure how much of the about card sits below the cover */
const aboutCard = $('.about-card'), cue = $('.scroll-cue');
const fit = () => {
  document.documentElement.classList.add('fill');
  const overlap = -parseFloat(getComputedStyle($('.about')).marginTop) || 0;
  const cueH = cue && cue.offsetHeight ? cue.offsetHeight : 0;
  document.documentElement.style.setProperty('--ab-rest', (aboutCard.offsetHeight - overlap + cueH) + 'px');
};
fit(); addEventListener('resize', fit, { passive: true });
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
if (cue) addEventListener('scroll', () => cue.classList.toggle('away', scrollY > 60), { passive: true });


/* in-page jumps glide with a long ease instead of the browser's quick smooth scroll */
const mainGl = makeGlider(() => scrollY, y => { scrollTo({ top: y, behavior: 'instant' }); followScroll(); });
const stopGlide = () => mainGl.stop();
addEventListener('touchstart', stopGlide, { passive: true });
addEventListener('keydown', e => { if (!/^(ArrowDown|ArrowUp|PageDown|PageUp|Home|End| )$/.test(e.key)) stopGlide(); }, { passive: true });

/* mouse-wheel scrolling eases toward where the wheel points, like the jumps above */
const fillMQ = matchMedia('(min-width: 1100px) and (min-height: 680px)');
/* the projects that will be on screen after the step start rising as the page moves, heading first */
function cueProjects(py) {
  const items = $$('#projects .reveal').filter(el => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y < py + innerHeight; });
  items.forEach((el, i) => {
    const prev = el.style.getPropertyValue('--d');
    el.style.setProperty('--d', (i * 35) + 'ms');
    el.classList.remove('above'); el.classList.add('in');
    setTimeout(() => { if (prev) el.style.setProperty('--d', prev); else el.style.removeProperty('--d'); }, 1600);
  });
}
const snapOK = () => { const a = $('.about'); return fillMQ.matches && a.offsetTop + a.offsetHeight <= innerHeight + 40; };
const projY = () => { let y = 0; for (let n = $('#projects'); n; n = n.offsetParent) y += n.offsetTop; return y - 40; };
const stopWheel = () => {};
const maxY = () => document.documentElement.scrollHeight - innerHeight;
addEventListener('wheel', e => {
  if (e.ctrlKey || document.body.classList.contains('lock') || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault();
  const d = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1);
  /* on a one-screen cover, a wheel turn moves between the cover and the projects as one step */
  if (performance.now() < glideEnd + 60) return;
  if (snapOK()) {
    const py = projY();
    if (d > 0 && scrollY < py - 4) { cueProjects(py); glideTo(py, 420, true); return; }
    if (d < 0 && scrollY > 0 && scrollY <= py + 4) { glideTo(0, 420, true); return; }
  }
  const from = mainGl.active ? mainGl.target : scrollY;
  mainGl.to(Math.max(0, Math.min(maxY(), from + d)), 420);
}, { passive: false });
let glideEnd = 0;
/* cubic-bezier(.3, 0, .12, 1): a soft start, most of the travel early, a long settle */
const bez = (x1, y1, x2, y2) => {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { let t = x; for (let i = 0; i < 6; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; } return Y(Math.min(1, Math.max(0, t))); };
};
const stepEase = bez(.3, 0, .2, 1);
const slideEase = bez(.22, .68, .25, 1), SLIDE_MS = 280;
function glideTo(y, ms, quick) {
  const dist = y - scrollY;
  const dur = ms || Math.min(900, Math.max(550, Math.abs(dist) * .75));
  glideEnd = performance.now() + dur;
  mainGl.to(y, dur);
}
const docTop = el => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y; };
$$('a.brand, .top nav a[href^="#"], .scroll-cue, .skip, .to-top').forEach(a => a.addEventListener('click', e => {
  const id = a.getAttribute('href').slice(1), el = document.getElementById(id);
  if (!el || document.body.classList.contains('lock')) return;
  e.preventDefault();
  const y = id === 'home' ? 0 : docTop(el) - (id === 'projects' ? 40 : 72);
  history.replaceState(null, '', '#' + id);
  if (id === 'projects' && scrollY < y - 4) cueProjects(y);
  glideTo(Math.max(0, y), Math.abs(y - scrollY) < innerHeight * 1.3 ? 420 : 0, true);
}));

/* header: mark the section being read */
const navLinks = $$('.top nav a[href^="#"]');
const navSecs = navLinks.map(a => document.getElementById(a.getAttribute('href').slice(1)));
let navTops = [], navCur = -1;
const measureNav = () => { navTops = navSecs.map(sec => sec ? docTop(sec) : Infinity); };
const markNav = () => {
  const line = scrollY + innerHeight * .45;
  let cur = 0;
  navTops.forEach((t, i) => { if (t <= line) cur = i; });
  if (cur === navCur) return;
  navCur = cur;
  navLinks.forEach((a, i) => { a.classList.toggle('cur', i === cur); if (i === cur) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
};
measureNav();
addEventListener('scroll', markNav, { passive: true });
addEventListener('resize', () => { measureNav(); navCur = -1; markNav(); }, { passive: true });
addEventListener('load', () => { measureNav(); navCur = -1; markNav(); });
markNav();

/* the cover drifts up and fades a little as the page moves on, so the hand-off to the projects feels continuous */
const heroIn = $('.hero-in'), aboutSec = $('.about');
let drift = 0;
const onDrift = () => {
  drift = 0;
  const y = Math.min(scrollY, hero.offsetHeight);
  heroIn.style.transform = y ? `translate3d(0, ${(y * .16).toFixed(1)}px, 0)` : '';
  heroIn.style.opacity = y ? Math.max(0, 1 - y / (hero.offsetHeight * .9)).toFixed(3) : '';
  /* the about card eases back and dims as it leaves, and returns the same way when scrolling up */
  const start = hero.offsetHeight * .35, k = Math.max(0, Math.min(1, (scrollY - start) / (innerHeight * .75)));
  aboutSec.style.transform = k ? `translate3d(0, ${(k * 20).toFixed(1)}px, 0)` : '';
  aboutSec.style.opacity = k ? (1 - k * .55).toFixed(3) : '';
};
addEventListener('scroll', () => { if (!drift) drift = requestAnimationFrame(onDrift); }, { passive: true });
followScroll = () => { onScroll(); markNav(); cancelAnimationFrame(drift); onDrift(); };

/* reveal: cards in the same row arrive a beat apart */
const reveals = $$('.reveal');
reveals.forEach(e => {
  if (!e.classList.contains('pc') || e.classList.contains('pc-lead')) return;
  const sibs = [...e.parentElement.children].filter(n => n.classList.contains('pc') && !n.classList.contains('pc-lead'));
  e.style.setProperty('--d', (sibs.indexOf(e) % 3) * 50 + 'ms');
});
if (!hasIO) reveals.forEach(e => e.classList.add('in'));
else {
  /* reveal both ways: things leaving the screen reset, so they arrive again from whichever side they come back */
  const io = new IntersectionObserver(es => es.forEach(e => {
    const t = e.target;
    if (e.isIntersecting) { t.classList.add('in'); t.classList.remove('above'); }
    else if (!document.body.classList.contains('lock')) { t.classList.remove('in'); t.classList.toggle('above', e.boundingClientRect.top < 0); }
  }), { rootMargin: '0px 0px -2% 0px', threshold: .06 });
  reveals.forEach(e => io.observe(e));
}

/* videos: load a little before they scroll in, play only while on screen */
function watch(videos, rootEl) {
  if (saveData || !hasIO) return;
  const load = v => {
    if (v.src || !v.dataset.src) return;
    v.muted = true; v.preload = 'auto'; v.src = v.dataset.src;
    v.addEventListener('playing', () => v.classList.add('on'), { once: true });
  };
  const near = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { load(e.target); near.unobserve(e.target); } }), { root: rootEl || null, rootMargin: '300px 0px' });
  const view = new IntersectionObserver(es => es.forEach(e => {
    const v = e.target;
    if (e.isIntersecting && !document.hidden) { load(v); v.play().catch(() => {}); }
    else v.pause();
  }), { root: rootEl || null, threshold: .35 });
  videos.forEach(v => { v.muted = true; near.observe(v); view.observe(v); });
}
/* project cards: a card's video plays only while the pointer is over it (or it has focus);
   on touch screens, only the card nearest the middle of the screen plays */
function cardVideos() {
  if (saveData) return;
  const cards = $$('.pc').filter(c => $('.pc-media video', c));
  const vid = c => $('.pc-media video', c);
  const start = v => {
    if (!v.src && v.dataset.src) {
      v.muted = true; v.preload = 'auto'; v.src = v.dataset.src;
      v.addEventListener('playing', () => v.classList.add('on'));
    }
    clearTimeout(v._t); v.classList.toggle('on', v.readyState > 2);
    v.play().catch(() => {});
  };
  const stop = v => {
    v.pause(); v.classList.remove('on');
    clearTimeout(v._t); v._t = setTimeout(() => { if (v.paused) v.currentTime = 0; }, 800);
  };
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    cards.forEach(c => {
      const v = vid(c);
      c.addEventListener('pointerenter', () => start(v));
      c.addEventListener('pointerleave', () => { if (!$(':focus-visible', c)) stop(v); });
      c.addEventListener('focusin', e => { if (e.target.matches(':focus-visible')) start(v); });
      c.addEventListener('focusout', () => { if (!c.matches(':hover')) stop(v); });
    });
    return;
  }
  if (!hasIO) return;
  const ratio = new Map();
  let cur = null;
  const pick = () => {
    let best = null, br = .6;
    ratio.forEach((r, c) => { if (r >= br) { br = r; best = c; } });
    if (best === cur) return;
    if (cur) stop(vid(cur));
    cur = best; if (cur && !document.hidden) start(vid(cur));
  };
  const box = new Map(cards.map(c => [$('.pc-media', c), c]));
  const io2 = new IntersectionObserver(es => { es.forEach(e => ratio.set(box.get(e.target), e.intersectionRatio)); pick(); },
    { rootMargin: '-20% 0px -20% 0px', threshold: [0, .3, .6, .8, 1] });
  box.forEach((c, m) => io2.observe(m));
}
cardVideos();
document.addEventListener('visibilitychange', () => { if (document.hidden) $$('video').forEach(v => v.pause()); });

/* project detail sheet, driven by the URL hash */
const sheet = $('#sheet'), sheetTitle = $('#sheet-title'), articles = $$('.dv');
/* mouse wheel in the detail sheet: quick but eased follow toward where the wheel points */
let swStart = 0, swLast = 0, swSnap = 0;
const sheetGl = makeGlider(() => sheet.scrollTop, y => { sheet.scrollTop = y; });
const sheetWheelStop = () => { sheetGl.stop(); clearTimeout(swSnap); };
function sheetWheel(d) {
  if (performance.now() - swLast > 220) swStart = sheet.scrollTop;
  swLast = performance.now();
  const from = sheetGl.active ? sheetGl.target : sheet.scrollTop;
  sheetGl.to(Math.max(0, Math.min(sheet.scrollHeight - sheet.clientHeight, from + d)), 380);
  clearTimeout(swSnap); swSnap = setTimeout(softSnap, 150);
}
/* free scrolling while the wheel turns; when it rests, the nearest slide snaps into place:
   a slide that fits is centred, a tall one meets the screen at its top or bottom (never pulled away mid-read) */
function snapTo(y) { sheetGl.to(y, Math.min(360, 220 + Math.abs(y - sheet.scrollTop) * .4)); }
function softSnap() {
  const art = articles.find(a => !a.hidden); if (!art || !open) return;
  /* judge from where the wheel was heading, then take over from the current position */
  const vh = sheet.clientHeight, cur = sheet.scrollTop, dest = sheetGl.active ? sheetGl.target : cur;
  const base = sheet.getBoundingClientRect().top, max = sheet.scrollHeight - vh;
  if (dest >= max - 2 || dest <= 2) return;
  let best = null, reading = false;
  const dir = Math.sign(dest - swStart);
  /* only places ahead of where the gesture began count, so a small turn moves on instead of being pulled back */
  const offer = y => {
    y = Math.max(0, Math.min(max, Math.round(y)));
    if (dir && (y - swStart) * dir <= 8) return;
    const d = Math.abs(y - dest); if (d < vh * .75 && (!best || d < best.d)) best = { y, d };
  };
  $$('section.ds[id]', art).forEach(sec => {
    const r = sec.getBoundingClientRect(), top = cur + (r.top - base), h = r.height;
    const vTop = top - dest, vBot = vTop + h;                         // where it would sit on screen at the destination
    if (vBot < -vh * .5 || vTop > vh * 1.5) return;
    if (h <= vh - 40) offer(top - (vh - h) / 2);
    else if (h <= vh + 80) offer(top - 24);
    else {
      if (vTop > -vh * .1 && vTop < vh * .4) offer(top - 24);
      if (vBot < vh * 1.1 && vBot > vh * .6) offer(top + h - vh + 24);
      if (vTop < -vh * .1 && vBot > vh * 1.1) reading = true;
    }
  });
  if (reading || !best || Math.abs(best.y - dest) <= 2) return;
  snapTo(best.y);
}
sheet.addEventListener('wheel', e => {
  if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;
  e.preventDefault();
  sheetWheel(e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? sheet.clientHeight : 1));
}, { passive: false });
['pointerdown', 'touchstart'].forEach(t => sheet.addEventListener(t, sheetWheelStop, { passive: true }));
const bound = new WeakSet();
let listY = 0, open = '', closeTimer = 0;
function finishClose() {
  clearTimeout(closeTimer); closeTimer = 0;
  sheet.getAnimations({ subtree: true }).forEach(a => a.cancel());
  sheet.style.pointerEvents = '';
  sheet.hidden = true;

}
/* opening a project grows the sheet out of its card; closing shrinks it back into the card */
const ezOut = 'cubic-bezier(.2,.75,.15,1)';
const order = articles => articles.map(a => a.dataset.id);
const cardRect = id => {
  const c = $(`.pc[data-project="${id}"]`); if (!c) return null;
  const r = c.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight ? r : null;
};
const insetOf = r => `inset(${Math.max(0, r.top).toFixed(1)}px ${Math.max(0, innerWidth - r.right).toFixed(1)}px ${Math.max(0, innerHeight - r.bottom).toFixed(1)}px ${Math.max(0, r.left).toFixed(1)}px round 10px)`;
const FULL = 'inset(0px 0px 0px 0px round 0px)', SMALL = 'inset(6% 5% 6% 5% round 16px)';
/* one motion for the whole sheet (bar and content together): the list recedes a little while the page comes forward */
const listEl = $('#list'), topEl = $('.top');
function openAnim(id, prevId) {
  const inner = $('.sheet-in', sheet);
  sheet.getAnimations({ subtree: true }).forEach(a => a.cancel());
  if (prevId) { inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' }); return; }
  sheet.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: ezOut });
}
function closeAnim(id) {
  sheet.getAnimations({ subtree: true }).forEach(a => a.cancel());
  sheet.style.pointerEvents = 'none';
  const a = sheet.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
  closeTimer = setTimeout(finishClose, 300);
  a.onfinish = finishClose;
}
/* back to the top of the detail sheet, at the right end of its last line */
const sheetTop = document.createElement('p');
sheetTop.className = 'end sheet-end';
sheetTop.innerHTML = '<a class="to-top" href="#top-of-sheet"><span>맨 위로</span><i aria-hidden="true"></i></a>';
/* same contact line as the main page footer, ahead of the top link */
const mainEnd = $('main p.end') || $('p.end:not(.sheet-end)');
if (mainEnd) [...mainEnd.children].filter(n => !n.classList.contains('to-top')).reverse().forEach(n => sheetTop.prepend(n.cloneNode(true)));
$('.sheet-in').appendChild(sheetTop);
$('a', sheetTop).addEventListener('click', e => {
  e.preventDefault();
  sheetGl.stop(); clearTimeout(swSnap);
  const from = sheet.scrollTop, t0 = performance.now(), dur = Math.min(900, Math.max(450, from * .3));
  const step = now => {
    const t = Math.min(1, (now - t0) / dur);
    sheet.scrollTop = from * (1 - stepEase(t));
    if (t < 1) requestAnimationFrame(step); else { const h = $('.dv:not([hidden]) h2', sheet); if (h) h.focus({ preventScroll: true }); }
  };
  requestAnimationFrame(step);
});

/* side arrows in the empty margins of the sheet: previous / next project without scrolling to the bottom */
const sideNav = ['prev', 'next'].map(k => {
  const a = document.createElement('a');
  a.className = 'side-nav ' + k;
  a.innerHTML = '<i aria-hidden="true"></i><span><small></small><b></b></span>';
  document.body.appendChild(a);
  return a;
});
/* the side arrows sit outside the sheet, so pass mouse-wheel scrolling over them on to the sheet */
sideNav.forEach(n => n.addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  e.preventDefault();
  sheetWheel(e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1));
}, { passive: false }));
function setSideNav(art) {
  $$('.pair-hover').forEach(n => n.classList.remove('pair-hover'));
  const links = $$('.pager a', art);
  [links.find(l => !l.classList.contains('next')), links.find(l => l.classList.contains('next'))].forEach((l, i) => {
    const s = sideNav[i];
    s.hidden = !l;
    if (!l) return;
    s.href = l.getAttribute('href');
    const name = $('b', l).textContent, num = $('small', l).textContent;
    $('b', s).textContent = name;
    $('small', s).textContent = num;
    s.setAttribute('aria-label', num + ': ' + name.replace(/\u2060/g, ''));
    s.title = num + ' ' + name.replace(/\u2060/g, '');
  });
}
/* the side arrows and the buttons at the foot of the sheet go to the same projects, so hovering one lights up its twin */
const pairOf = el => {
  const art = articles.find(a => !a.hidden); if (!art) return null;
  const links = $$('.pager a', art), prev = links.find(l => !l.classList.contains('next')), next = links.find(l => l.classList.contains('next'));
  if (el === sideNav[0]) return prev; if (el === sideNav[1]) return next;
  if (el === prev) return sideNav[0]; if (el === next) return sideNav[1];
  return null;
};
const pairOn = e => { const t = pairOf(e.currentTarget); if (t) t.classList.add('pair-hover'); };
const pairOff = e => { const t = pairOf(e.currentTarget); if (t) t.classList.remove('pair-hover'); };
sideNav.forEach(n => { n.addEventListener('mouseenter', pairOn); n.addEventListener('mouseleave', pairOff); });
$$('.dv .pager a').forEach(l => { l.addEventListener('mouseenter', pairOn); l.addEventListener('mouseleave', pairOff); });
addEventListener('keydown', e => {
  if (!open || e.altKey || e.ctrlKey || e.metaKey || /input|textarea|select|video/i.test(e.target.tagName)) return;
  if (e.key === 'ArrowLeft' && !sideNav[0].hidden) sideNav[0].click();
  if (e.key === 'ArrowRight' && !sideNav[1].hidden) sideNav[1].click();
});

/* floating contents button (bottom right): the section list stays one click away anywhere in the sheet */
const tocBtn = document.createElement('button');
tocBtn.type = 'button'; tocBtn.className = 'toc-fab'; tocBtn.setAttribute('aria-expanded', 'false');
tocBtn.innerHTML = '<i aria-hidden="true"></i>'; tocBtn.setAttribute('aria-label', '목차'); tocBtn.title = '목차';
const topBtn = document.createElement('button');
topBtn.type = 'button'; topBtn.className = 'top-fab'; topBtn.setAttribute('aria-label', '맨 위로'); topBtn.title = '맨 위로';
topBtn.innerHTML = '<i aria-hidden="true"></i>';
topBtn.addEventListener('click', () => { closeToc(); $('a', sheetTop).click(); });
const fabs = document.createElement('div'); fabs.className = 'fab-stack';
const tocPanel = document.createElement('nav');
tocPanel.className = 'toc-pop'; tocPanel.hidden = true; tocPanel.setAttribute('aria-label', '상세 목차');
fabs.append(tocBtn, topBtn); document.body.append(tocPanel, fabs);
const closeToc = () => { tocPanel.hidden = true; tocBtn.setAttribute('aria-expanded', 'false'); };
const fillToc = () => {
  const art = articles.find(a => !a.hidden); if (!art) return;
  tocPanel.innerHTML = '<ol>' + $$('.dv-toc a', art).map(a =>
    `<li><a href="#${a.dataset.to}" data-to="${a.dataset.to}"${a.classList.contains('cur') ? ' class="cur" aria-current="true"' : ''}>${a.innerHTML}</a></li>`).join('') + '</ol>';
  $$('a', tocPanel).forEach(l => l.addEventListener('click', e => {
    e.preventDefault(); closeToc();
    const src = $(`.dv-toc a[data-to="${l.dataset.to}"]`, art); if (src) src.click();
  }));
};
tocBtn.addEventListener('click', () => {
  if (tocPanel.hidden) { fillToc(); tocPanel.hidden = false; tocBtn.setAttribute('aria-expanded', 'true'); const c = $('a.cur', tocPanel) || $('a', tocPanel); c && c.focus({ preventScroll: true }); }
  else closeToc();
});
document.addEventListener('pointerdown', e => { if (!tocPanel.hidden && !tocPanel.contains(e.target) && !tocBtn.contains(e.target)) closeToc(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !tocPanel.hidden) { e.stopImmediatePropagation(); closeToc(); tocBtn.focus(); } }, true);
sheet.addEventListener('scroll', () => { if (!tocPanel.hidden) fillToc(); }, { passive: true });
fabs.addEventListener('wheel', e => { e.preventDefault(); sheetWheel(e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? innerHeight : 1)); }, { passive: false });

function route() {
  const id = location.hash.slice(1);
  const art = articles.find(a => a.dataset.id === id);
  closeToc();
  if (art) {
    if (closeTimer) finishClose();
    const prevId = open;
    if (!open) listY = scrollY;
    open = id;
    articles.forEach(a => a.hidden = a !== art);
    sheet.hidden = false; document.body.classList.add('lock');
    openAnim(id, prevId);
    sheet.scrollTop = 0; sheet.classList.remove('scrolled', 'bar-off'); lastTop = 0;
    const h = art.querySelector('h2');
    sheetTitle.textContent = h.textContent; document.title = h.textContent.replace(/\u2060/g, '') + ' · 정승호 포트폴리오';
    h.focus({ preventScroll: true });
    setSideNav(art);
    if (!bound.has(art)) { bound.add(art); const vs = $$('video', art); vs.forEach(v => { if (!v.src && v.dataset.src) v.src = v.dataset.src; }); watch(vs, sheet); }
  } else if (open) {
    const was = open;
    open = '';
    $$('video', sheet).forEach(v => v.pause());
    document.title = '정승호 포트폴리오';
    /* restore the list behind the sheet first, then fade the sheet away */
    document.body.classList.remove('lock');
    if (!id || id === 'projects') scrollTo({ top: listY, behavior: 'instant' });
    else document.getElementById(id)?.scrollIntoView({ behavior: 'instant' });
    closeAnim(was);
  }
}
/* detail table of contents: jump inside the sheet, mark the section being read */
$$('.dv-toc').forEach(toc => {
  const links = $$('a', toc);
  const mark = id => links.forEach(a => {
    const on = a.dataset.to === id;
    a.classList.toggle('cur', on);
    if (on) {
      a.setAttribute('aria-current', 'true');
      if (toc.scrollWidth > toc.clientWidth + 2) toc.scrollTo({ left: a.offsetLeft - 70, behavior: 'smooth' });
      /* the bar names the project and the section being read, so the contents list can stay at the top of the page */
      const art = toc.closest('.dv');
      if (art && !art.hidden) sheetTitle.innerHTML = '<b>' + art.querySelector('h2').textContent + '</b><span>' + a.textContent.replace(/^\d+/, '').trim() + '</span>';
    }
    else a.removeAttribute('aria-current');
  });
  links.forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const t = document.getElementById(a.dataset.to);
    if (t) {
      const y = Math.max(0, Math.round(sheet.scrollTop + t.getBoundingClientRect().top - sheet.getBoundingClientRect().top - (parseFloat(getComputedStyle(t).scrollMarginTop) || 0)));
      if (typeof sheetGlide === 'function') { kbAim = y; sheetGlide(y); } else t.scrollIntoView({ block: 'start' });
      mark(a.dataset.to);
    }
  }));
  if (hasIO) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) mark(e.target.id); }), { root: sheet, rootMargin: '-130px 0px -60% 0px' });
    links.forEach(a => { const t = document.getElementById(a.dataset.to); if (t) io.observe(t); });
  }
  mark(links[0].dataset.to);
});
/* while reading downwards the bar slides away; any upward scroll brings it back */
let lastTop = 0;
sheet.addEventListener('scroll', () => {
  const t = sheet.scrollTop, d = t - lastTop;
  sheet.classList.toggle('scrolled', t > 120);
  if (t < 160 || d < -6) sheet.classList.remove('bar-off');
  else if (d > 6) sheet.classList.add('bar-off');
  lastTop = t;
}, { passive: true });
$('.sheet-bar .back').addEventListener('click', e => { e.preventDefault(); history.replaceState(null, '', location.pathname + location.search + '#projects'); route(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && open) $('.sheet-bar .back').click(); });
/* image viewer: images open over the page instead of a new tab; back, Esc, ✕ or a click outside closes it */
const lb = document.createElement('div');
lb.className = 'lightbox'; lb.hidden = true; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', '이미지 크게 보기');
lb.innerHTML = '<button type="button" class="lb-close" aria-label="닫기" title="닫기"><i aria-hidden="true"></i></button><div class="lb-stage"><img alt=""></div><p class="lb-cap"></p>';
document.body.append(lb);
const lbImg = $('img', lb), lbCap = $('.lb-cap', lb), lbStage = $('.lb-stage', lb);
let lbOpener = null, lbPushed = false;
const lbFits = () => lbImg.naturalWidth <= lbStage.clientWidth && lbImg.naturalHeight <= lbStage.clientHeight;
const lbSync = () => lb.classList.toggle('can-zoom', !!lbImg.naturalWidth && !lbFits());
const lbShut = () => {
  if (lb.hidden) return;
  lb.classList.remove('on', 'zoom');
  setTimeout(() => { lb.hidden = true; lbImg.removeAttribute('src'); }, 160);
  if (lbOpener) lbOpener.focus({ preventScroll: true });
};
const lbClose = () => { if (lbPushed) { lbPushed = false; history.back(); } else lbShut(); };
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a.image-open');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
  e.preventDefault();
  const fig = a.closest('figure'), cap = fig && $('figcaption', fig), img = $('img', a);
  lbOpener = a;
  lbImg.src = a.getAttribute('href'); lbImg.alt = img ? img.alt : '';
  lbCap.textContent = cap ? cap.textContent : ''; lbCap.hidden = !cap;
  lb.classList.remove('zoom', 'can-zoom'); lb.hidden = false;
  requestAnimationFrame(() => lb.classList.add('on'));
  history.pushState({ lightbox: 1 }, ''); lbPushed = true;
  $('.lb-close', lb).focus({ preventScroll: true });
});
lbImg.addEventListener('load', lbSync);
addEventListener('resize', () => { if (!lb.hidden) lbSync(); });
addEventListener('popstate', () => { if (!lb.hidden) { lbPushed = false; lbShut(); } });
$('.lb-close', lb).addEventListener('click', lbClose);
lb.addEventListener('click', e => {
  if (e.target === lbImg) { if (lb.classList.contains('can-zoom') || lb.classList.contains('zoom')) lb.classList.toggle('zoom'); return; }
  if (!e.target.closest('.lb-close')) lbClose();
});
lb.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
addEventListener('keydown', e => { if (e.key === 'Escape' && !lb.hidden) { e.stopImmediatePropagation(); lbClose(); } }, true);
/* keyboard: ↓ ↑ · PageDown/PageUp · Space step one slide (a detail section, or a block of the main page) at a time;
   a block taller than the screen is read through first. Home/End go to the ends. */
let kbAim = null;
const sheetGlide = y => { clearTimeout(swSnap); sheetGl.to(y, SLIDE_MS + 40); };
const sheetStops = () => {
  const art = articles.find(a => !a.hidden); if (!art) return [0];
  const base = sheet.scrollTop - sheet.getBoundingClientRect().top;
  const ys = $$('section.ds[id]', art).map(sec => base + sec.getBoundingClientRect().top - (parseFloat(getComputedStyle(sec).scrollMarginTop) || 0));
  ys[0] = 0;
  return ys.map(y => Math.max(0, Math.round(y)));
};
const mainStops = () => {
  const ys = [0];
  if (snapOK()) ys.push(projY());
  else ys.push(docTop($('#projects')) - 72);
  let last = -1e9;
  $$('#projects .pc').map(el => docTop(el) - 96).sort((a, b) => a - b).forEach(y => { if (y - last > 40) { ys.push(y); last = y; } });
  const out = [];
  ys.map(y => Math.max(0, Math.round(y))).sort((a, b) => a - b).forEach(y => { if (!out.length || y - out[out.length - 1] > innerHeight * .25) out.push(y); });
  return out;
};
const kbStep = (dir, now, max, stops) => {
  const reach = innerHeight * .85;
  if (dir > 0) {
    const next = stops.find(y => y > now + 4);
    const y = next === undefined ? max : next;
    return Math.min(max, y - now > reach + innerHeight * .15 ? now + reach : y);
  }
  const prev = [...stops].reverse().find(y => y < now - 4);
  const y = prev === undefined ? 0 : prev;
  return Math.max(0, now - y > reach + innerHeight * .15 ? now - reach : y);
};
addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !lb.hidden || !tocPanel.hidden) return;
  const tag = e.target.tagName || '';
  if (/input|textarea|select|video|audio/i.test(tag) || e.target.isContentEditable) return;
  let dir = 0;
  if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) dir = 1;
  else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) dir = -1;
  else if (e.key === 'Home') dir = -2;
  else if (e.key === 'End') dir = 2;
  if (!dir || (e.key === ' ' && /button|^a$/i.test(tag))) return;
  e.preventDefault();
  if (open) {
    const max = sheet.scrollHeight - sheet.clientHeight;
    const now = sheetGl.active ? sheetGl.target : sheet.scrollTop;
    const y = dir === -2 ? 0 : dir === 2 ? max : kbStep(dir, now, max, sheetStops());
    kbAim = y; sheetGlide(y);
  } else {
    const max = maxY();
    const now = mainGl.active ? mainGl.target : scrollY;
    const y = dir === -2 ? 0 : dir === 2 ? max : kbStep(dir, now, max, mainStops());
    if (y > scrollY && scrollY < projY() - 4 && y >= projY() - 4) cueProjects(y);
    kbAim = y; glideTo(y, SLIDE_MS + 40, 'slide');
  }
});
/* rotating the phone or resizing the window keeps the reader on the same block, at the same spot */
const anchorOf = (inSheet) => {
  const list = inSheet ? $$('section.ds[id]', articles.find(a => !a.hidden) || document) : [$('.hero'), $('.about'), ...$$('#projects .pc'), $('p.end')].filter(Boolean);
  const top0 = inSheet ? sheet.getBoundingClientRect().top : 0;
  const vh = inSheet ? sheet.clientHeight : innerHeight;
  let cover = null;
  for (const el of list) {
    const r = el.getBoundingClientRect(), t = r.top - top0, bt = r.bottom - top0;
    if (t >= -4 && t < vh * .6) return { el, off: t };                                  // a block starting near the top: keep its top there
    if (!cover && t < 0 && bt > 8) cover = { el, ratio: -t / Math.max(1, r.height) };     // otherwise: how far into the block we are
  }
  return cover;
};
let keepAt = null, keepRaf = 0, resizing = 0;
const noteAnchor = () => { if (resizing) return; if (!keepRaf) keepRaf = requestAnimationFrame(() => { keepRaf = 0; keepAt = { sheet: !!open, a: anchorOf(!!open) }; }); };
addEventListener('scroll', noteAnchor, { passive: true });
sheet.addEventListener('scroll', noteAnchor, { passive: true });
addEventListener('resize', () => {
  const k = keepAt; if (!k || !k.a) return;
  clearTimeout(resizing);
  resizing = setTimeout(() => { resizing = 0; }, 400);
  requestAnimationFrame(() => {
    if (k.sheet !== !!open || !k.a.el.isConnected) return;
    const r = k.a.el.getBoundingClientRect(), want = 'off' in k.a ? k.a.off : -k.a.ratio * r.height;
    if (k.sheet) { sheetGl.stop(); sheet.scrollTop += (r.top - sheet.getBoundingClientRect().top) - want; }
    else { stopGlide(); scrollTo({ top: scrollY + r.top - want, behavior: 'instant' }); followScroll(); }
  });
}, { passive: true });
noteAnchor();
addEventListener('hashchange', route); route();
})();
