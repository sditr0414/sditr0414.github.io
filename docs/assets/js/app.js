'use strict';
(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const dialog = $('#media-dialog');
  const media = $('#dialog-content');
  const title = $('#dialog-title');
  const controls = $('#gallery-controls');
  const imageSizeToggle = $('#image-size-toggle');
  const fullscreenButton = $('#video-fullscreen');
  fullscreenButton.addEventListener('click', async () => {
    const video = $('video', media);
    if (!video) return;
    try {
      if (video.requestFullscreen) await video.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch {
      notify('전체 화면을 열지 못했습니다. 영상의 재생 컨트롤을 이용해 주세요.');
    }
  });
  function resetImageSize(show = true) {
    media.classList.remove('is-actual-size');
    imageSizeToggle.hidden = !show;
    imageSizeToggle.textContent = '원본 크기';
    imageSizeToggle.setAttribute('aria-pressed','false');
  }
  imageSizeToggle.addEventListener('click', () => {
    const actual = media.classList.toggle('is-actual-size');
    imageSizeToggle.textContent = actual ? '화면에 맞춤' : '원본 크기';
    imageSizeToggle.setAttribute('aria-pressed',String(actual));
  });
  const gallery = [
    ['assets/images/cad-assembly.webp','SolidWorks 어셈블리 모델링 · 전공 실습'],
    ['assets/images/cad-train.webp','SolidWorks 파트·어셈블리 모델링 · 전공 실습'],
    ['assets/images/cae-structure.webp','Ansys 구조 해석 · 전공 실습'],
    ['assets/images/cae-modal.webp','Ansys 진동 해석 · 전공 실습']
  ];
  let galleryIndex = 0, lastFocus = null;
  function openDialog(label) {
    lastFocus = document.activeElement;
    title.textContent = label;
    dialog.showModal();
    $('#dialog-close').focus();
  }
  function showImage(src, label, isGallery = false) {
    dialog.classList.remove('is-video');
    fullscreenButton.hidden = true;
    resetImageSize();
    media.replaceChildren();
    const img = new Image(); img.src = src; img.alt = label;
    media.append(img); title.textContent = label; controls.hidden = !isGallery;
  }
  function updateGallery() {
    const [src, label] = gallery[galleryIndex];
    showImage(src, label, true);
    $('#gallery-position').textContent = `${galleryIndex + 1} / ${gallery.length}`;
  }
  $$('main [data-image]').forEach(button => button.addEventListener('click', () => {
    showImage(button.dataset.image, button.dataset.caption);
    openDialog(button.dataset.caption);
  }));
  $$('main [data-video]').forEach(button => button.addEventListener('click', () => {
    controls.hidden = true; resetImageSize(false); media.replaceChildren();
    dialog.classList.add('is-video');
    const video = document.createElement('video');
    video.src = button.dataset.video; video.controls = true; video.playsInline = true;
    fullscreenButton.hidden = !(document.fullscreenEnabled && video.requestFullscreen || video.webkitEnterFullscreen);
    video.preload = 'metadata'; video.setAttribute('aria-label',button.dataset.title);
    video.addEventListener('error', () => {
      fullscreenButton.hidden = true;
      const message = document.createElement('p');
      message.className = 'video-error';
      message.textContent = '영상을 재생하지 못했습니다. ';
      const link = document.createElement('a');
      link.href = button.dataset.video;
      link.textContent = '영상 파일 직접 열기';
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      message.append(link); media.replaceChildren(message);
    }, {once:true});
    media.append(video); openDialog(button.dataset.title);
    video.play().catch(() => {});
  }));
  $$('main [data-gallery]').forEach(button => button.addEventListener('click', () => {
    galleryIndex = 0; updateGallery(); openDialog(gallery[0][1]);
  }));
  $('#gallery-prev').addEventListener('click', () => { galleryIndex=(galleryIndex+gallery.length-1)%gallery.length; updateGallery(); });
  $('#gallery-next').addEventListener('click', () => { galleryIndex=(galleryIndex+1)%gallery.length; updateGallery(); });
  $('#dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    dialog.classList.remove('is-video');
    fullscreenButton.hidden = true;
    resetImageSize(false);
    const video = $('video', media);
    if (video) { video.pause(); video.removeAttribute('src'); video.load(); }
    media.replaceChildren();
    if (lastFocus?.isConnected) lastFocus.focus();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (!controls.hidden && ['ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault(); galleryIndex=(galleryIndex+(event.key==='ArrowLeft'?-1:1)+gallery.length)%gallery.length;
      updateGallery();
    }
  });

  // Keep the full project index and page position in sync with the visible artboard.
  const slides = $$('main .page-shell > .slide');
  const nav = $('#project-nav');
  const navLinks = $$('nav a[data-section]', nav);
  const toggle = $('#nav-toggle');
  function closeNav({returnFocus=false}={}) {
    const wasOpen=nav.classList.contains('is-open');
    nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded','false');
    if(returnFocus && wasOpen && toggle.getClientRects().length)toggle.focus();
  }
  toggle.addEventListener('click', () => {
    const open = !nav.classList.contains('is-open');
    nav.classList.toggle('is-open',open); toggle.setAttribute('aria-expanded',String(open));
  });
  navLinks.forEach(a => a.addEventListener('click', () => {
    closeNav();
    const target=document.getElementById(a.hash.slice(1));
    if(target){target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
  }));
  document.addEventListener('click', event => {
    if (!nav.contains(event.target) && !toggle.contains(event.target)) closeNav();
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeNav({returnFocus:true});}});
  let current = slides[0];
  function markActive() {
    const top = window.innerWidth <= 1230 ? 108 : 78;
    current = slides[0];
    let largest = -1;
    for (const slide of slides) {
      const r = slide.getBoundingClientRect();
      const visible = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, top));
      if (visible > largest) { largest = visible; current = slide; }
    }
    const key = current.dataset.project;
    const group = slides.filter(s=>s.dataset.project===key);
    const part = group.indexOf(current)+1;
    const index = slides.indexOf(current)+1;
    navLinks.forEach(a=>{
      const active=a.dataset.section===key;
      a.classList.toggle('active',active);
      if(active)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');
      const indicator=$('[data-stage]',a);
      if(indicator)indicator.textContent=active?`${part}/${group.length}`:'';
      a.setAttribute('aria-label', a.dataset.label+(active && group.length>1?` · ${part}/${group.length} 페이지`:''));
    });
    $('#mobile-current').textContent = `${current.dataset.title}${group.length>1?` · ${part}/${group.length}`:''}`;
    const pagePosition = `${String(index).padStart(2,'0')} / ${slides.length}`;
    $('#mobile-count').textContent = pagePosition;
  }
  let scheduled=false;
  window.addEventListener('scroll',()=>{
    if(scheduled)return;
    scheduled=true; requestAnimationFrame(()=>{markActive();scheduled=false;});
  },{passive:true});
  window.addEventListener('resize',()=>{if(innerWidth>1230)closeNav();markActive();}); markActive();

  let toastTimer;
  function notify(message) {
    const toast=$('#status'); toast.textContent=message; toast.classList.add('visible');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('visible'),7000);
  }
  // The slide content and typography are identical in web and print.
  // Only the parent sheet arrangement is changed; no rewriting, hidden captions,
  // image replacement, PDF-only font sizes, or per-page shrinking is allowed.
  function cloneArtboard(original) {
    const shell=document.createElement('section');
    shell.className='page-shell';
    const clone=original.cloneNode(true);
    clone.removeAttribute('id'); clone.removeAttribute('tabindex');
    clone.removeAttribute('aria-labelledby');
    $$('[id]',clone).forEach(el=>el.removeAttribute('id'));
    shell.append(clone);
    return shell;
  }
  function preparePrint(mode='handout') {
    if (!['handout','slides'].includes(mode)) throw new Error('Unknown print mode');
    const root=$('#print-root');root.replaceChildren();
    $('#print-page-size').textContent=mode==='slides'
      ?'@page{size:296.333333mm 166.6875mm;margin:0}'
      :'@page{size:A4 portrait;margin:0}';
    if(mode==='slides'){
      slides.forEach(slide=>{
        const page=document.createElement('div');page.className='single-pdf-page';
        page.append(cloneArtboard(slide));root.append(page);
      });
    }else{
      const pages=Math.ceil(slides.length/2);
      for(let i=0;i<slides.length;i+=2){
        const page=document.createElement('section');page.className='handout';
        const heading=document.createElement('header');heading.className='handout-heading';
        heading.innerHTML='<strong>정승호 · 포트폴리오</strong><span>A4 · 2슬라이드</span>';
        const pair=document.createElement('div');pair.className='handout-slots';
        slides.slice(i,i+2).forEach(slide=>{
          const slot=document.createElement('div');slot.className='print-slot';
          slot.append(cloneArtboard(slide));pair.append(slot);
        });
        if(i+1===slides.length){
          const note=document.createElement('div');note.className='handout-note';
          note.innerHTML='메모<div class="note-line"></div><div class="note-line"></div><div class="note-line"></div>';
          pair.append(note);
        }
        const footer=document.createElement('footer');footer.className='handout-footer';
        footer.innerHTML=`<span>3095069@naver.com</span><span>${Math.floor(i/2)+1} / ${pages}</span>`;
        page.append(heading,pair,footer);root.append(page);
      }
    }
    root.dataset.mode=mode;
    return root;
  }
  let requestedMode='handout';
  async function printPortfolio(mode='handout') {
    const button=mode==='slides'?$('#pdf-button'):null;
    if(button)button.disabled=true;
    try {
      if(dialog.open)dialog.close();closeNav();requestedMode=mode;
      await document.fonts.ready;
      await Promise.all($$('main img').map(img=>img.decode().catch(()=>{})));
      preparePrint(mode);
      notify(mode==='slides'
        ?'인쇄 대상에서 ‘PDF로 저장’을 선택하세요. 웹과 같은 디자인으로 16:9 페이지를 만듭니다.'
        :'A4 세로 · 용지당 1페이지 · 배율 100%로 인쇄하세요. 두 슬라이드가 이미 배치되어 있습니다.');
      window.print();
    }catch(error){
      console.error(error);notify('인쇄창을 열지 못했습니다. 브라우저의 인쇄 메뉴에서 다시 시도해 주세요.');
    }finally{if(button)button.disabled=false;}
  }
  $('#pdf-button').addEventListener('click',()=>printPortfolio('slides'));
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='p'){
      event.preventDefault();printPortfolio('handout');
    }
  });
  window.addEventListener('beforeprint',()=>{
    if(!document.body.classList.contains('exporting'))preparePrint(requestedMode);
  });
  window.addEventListener('afterprint',()=>{requestedMode='handout';});
  function setExportMode(value=true){
    document.body.classList.toggle('exporting',value);
    if(value){
      $('#print-root').replaceChildren();
      $('#print-page-size').textContent='@page{size:296.333333mm 166.6875mm;margin:0}';
      closeNav();
    }
  }
  window.Portfolio={markActive,get current(){return current;},preparePrint,printPortfolio,setExportMode,
    setOutputMode(mode){requestedMode=mode;return preparePrint(mode);},get slides(){return slides;}};
})();

// Presentation navigation
'use strict';
(() => {
  const body = document.body;
  const main = document.querySelector('#main');
  const header = document.querySelector('.site-header');
  const nav = document.querySelector('#project-nav');
  const navList = nav.querySelector('nav');
  const slides = [...window.Portfolio.slides];
  const footer = document.querySelector('.site-footer');
  const desktop = matchMedia('(min-width:1000px) and (min-height:540px)');
  const frames = slides.map(slide => {
    const shell = slide.parentElement;
    const frame = document.createElement('section');
    frame.className = 'deck-frame';
    shell.before(frame); frame.append(shell);
    return frame;
  });
  frames.at(-1).append(footer);
  body.classList.add('deck-ready');
  main.setAttribute('tabindex', '-1');

  const make = (tag, className, parent) => {
    const node = document.createElement(tag);
    node.className = className; node.dataset.motionOnly = ''; parent.append(node); return node;
  };
  const progress = make('div', 'deck-progress', body);
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', '포트폴리오 진행도');
  progress.setAttribute('aria-valuemin', '1');
  progress.setAttribute('aria-valuemax', String(slides.length));
  make('span', 'deck-progress-fill', progress);
  document.querySelector('#pdf-button').setAttribute('aria-label', 'PDF 저장');
  const marker = make('span', 'motion-nav-marker', navList);
  marker.setAttribute('aria-hidden', 'true');

  let active = 0;
  let target = 0;
  let renderFrame = 0;
  let animations = [];
  let moving = false;
  let resizeTimer;
  let wheelAt = 0, wheelSum = 0, wheelDirection = 0, wheelStepAt = -Infinity;
  let pendingWheel = 0;
  let exporting = body.classList.contains('exporting');
  const enabled = () => true;
  const clamp = i => Math.max(0, Math.min(slides.length - 1, i));

  function fit() {
    if (exporting) return;
    body.classList.toggle('deck-reading', !desktop.matches);
    body.style.setProperty('--reading-top', `${header.offsetHeight + 16}px`);
    const rail = innerWidth >= 1700 ? 248 : 0;
    const gap = innerWidth < 1400 ? 16 : 24;
    const top = header.offsetHeight + 16;
    const width = Math.max(1, main.clientWidth - rail - gap * 2);
    const height = Math.max(1, main.clientHeight - top - 16);
    const scale = Math.min(1.1, width / 1120, height / 630);
    const lastHeight = Math.max(1, height - footer.offsetHeight - 16);
    const lastScale = Math.min(1.1, width / 1120, lastHeight / 630);
    const vars = {
      '--deck-rail': `${rail}px`, '--deck-scale': scale,
      '--deck-nav-x': `${gap + (width - 1120 * scale) / 2 + 1120 * scale + 64}px`,
      '--deck-footer-x': `${gap + (width - 1120 * lastScale) / 2}px`,
      '--deck-footer-width': `${1120 * lastScale}px`,
      '--deck-footer-y': `${top + (lastHeight - 630 * lastScale) / 2 + 630 * lastScale + 16}px`,
      '--deck-x': `${gap + (width - 1120 * scale) / 2}px`,
      '--deck-y': `${top + (height - 630 * scale) / 2}px`,
      '--deck-last-scale': lastScale,
      '--deck-last-x': `${gap + (width - 1120 * lastScale) / 2}px`,
      '--deck-last-y': `${top + (lastHeight - 630 * lastScale) / 2}px`
    };
    for (const [key, value] of Object.entries(vars)) body.style.setProperty(key, String(value));
  }
  function syncPreference() {
    body.dataset.motion = enabled() ? 'full' : 'reduced';

  }
  function update() {
    renderFrame = 0;
    window.Portfolio.markActive();
    active = Math.max(0, slides.indexOf(window.Portfolio.current));
    if (!moving) target = active;
    const label = `${String(active + 1).padStart(2, '0')} / ${slides.length}`;
    if (progress.getAttribute('aria-valuenow') !== String(active + 1)) {
      progress.setAttribute('aria-valuenow', String(active + 1));
      progress.setAttribute('aria-valuetext', `${label} · ${slides[active].dataset.title}`);
      body.style.setProperty('--deck-progress', String((active + 1) / slides.length));
    }
    const link = navList.querySelector('[aria-current="location"]');
    if (link && nav.getClientRects().length) {
      const a = link.getBoundingClientRect(), b = navList.getBoundingClientRect();
      marker.style.transform = `translateY(${a.top - b.top + (a.height - 18) / 2}px)`;
      marker.style.opacity = '1';
    }
  }
  function schedule() { if (!renderFrame) renderFrame = requestAnimationFrame(update); }
  function cancelMove() {
    const pending = animations;
    animations = []; moving = false; pendingWheel = 0;
    for (const effect of pending) effect.cancel();
    body.classList.remove('deck-moving');
  }
  const frameTop = index => Math.max(0, frames[index].offsetTop - (desktop.matches ? 0 : header.offsetHeight + 16));
  function goTo(index, {historyMode = 'replace'} = {}) {
    index = clamp(index);
    const previous = target;
    cancelMove();
    target = index;
    if (historyMode && location.hash !== `#${slides[index].id}`) {
      history[historyMode === 'push' ? 'pushState' : 'replaceState'](null, '', `#${slides[index].id}`);
    }
    const finish = () => {
      moving = false; animations = [];
      body.classList.remove('deck-moving');
      update();
      const nextDirection = performance.now() - wheelAt < 160 ? pendingWheel : 0;
      pendingWheel = 0;
      if (nextDirection && clamp(target + nextDirection) !== target) {
        wheelStepAt = performance.now();
        goTo(target + nextDirection);
        return;
      }
      if (!header.contains(document.activeElement) && !document.querySelector('dialog[open]')) {
        slides[index].setAttribute('tabindex', '-1');
        slides[index].focus({preventScroll: true});
      }
    };
    body.classList.add('deck-moving');
    moving = true;
    const end = frameTop(index);
    main.scrollTo({top: end, behavior: 'instant'});
    if (!enabled() || !desktop.matches || previous === index) {finish(); return;}
    const distance = Math.sign(index - previous) * main.clientHeight;
    const origin = end - frames[previous].offsetTop;
    const options = {duration: 280, easing: 'cubic-bezier(.22,.68,.25,1)'};
    // Only the outgoing and incoming frames animate; no per-frame scroll or layout reads.
    const outgoing = frames[previous].animate([
      {transform: `translateY(${origin}px)`},
      {transform: `translateY(${origin - distance}px)`}
    ], options);
    const incoming = frames[index].animate([
      {transform: `translateY(${distance}px)`}, {transform: 'translateY(0)'}
    ], options);
    animations = [outgoing, incoming];
    Promise.all(animations.map(effect => effect.finished)).then(finish).catch(() => {});
  }
  main.addEventListener('scroll', () => {if (!moving) schedule();}, {passive: true});

  function nestedScroll(element) {
    for (let node = element instanceof Element ? element : null; node && node !== main; node = node.parentElement) {
      if (node.matches('input,textarea,select,[contenteditable="true"]')) return true;
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1) return true;
    }
    return false;
  }
  document.addEventListener('wheel', event => {
    if (!desktop.matches || exporting || event.defaultPrevented || !event.cancelable || event.ctrlKey || event.metaKey || event.shiftKey ||
        Math.abs(event.deltaX) > Math.abs(event.deltaY) || document.querySelector('dialog[open]') || nav.contains(event.target) || nestedScroll(event.target)) return;
    if (!event.deltaY) return;
    event.preventDefault();
    const now = performance.now(), direction = Math.sign(event.deltaY);
    if (now - wheelAt > 160 || direction !== wheelDirection) {wheelSum = 0; pendingWheel = 0;}
    wheelAt = now; wheelDirection = direction;
    wheelSum += Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? main.clientHeight : 1);
    if (wheelSum < 36) return;
    wheelSum = 0;
    // Retain at most one recent request while the current slide finishes.
    if (moving) {pendingWheel = direction; return;}
    if (now - wheelStepAt < 180) return;
    wheelStepAt = now;
    goTo(target + direction);
  }, {passive: false});

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button) return;
    const index = slides.findIndex(slide => `#${slide.id}` === link.getAttribute('href'));
    if (index < 0) return;
    event.preventDefault();
    if (nav.contains(link)) {
      nav.classList.remove('is-open');
      document.querySelector('#nav-toggle').setAttribute('aria-expanded', 'false');
    }
    goTo(index, {historyMode: 'push'});
  }, true);
  document.addEventListener('keydown', event => {
    if (!desktop.matches || exporting || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') ||
        event.target.closest('button,input,textarea,select,[contenteditable="true"]')) return;
    const steps = {ArrowDown: 1, PageDown: 1, ' ': event.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1};
    if (!(event.key in steps) && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    if (event.repeat && moving) return;
    goTo(event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : target + steps[event.key]);
  });
  main.addEventListener('pointerdown', () => {cancelMove(); body.classList.remove('deck-moving');}, {passive: true});
  new MutationObserver(schedule).observe(nav, {attributes: true, attributeFilter: ['class']});
  const fromHash = () => Math.max(0, slides.findIndex(slide => `#${slide.id}` === location.hash));
  addEventListener('popstate', () => goTo(fromHash(), {historyMode: null}));
  addEventListener('hashchange', () => goTo(fromHash(), {historyMode: null}));
  addEventListener('resize', () => {
    const wasReading = body.classList.contains('deck-reading');
    clearTimeout(resizeTimer); cancelMove();
    resizeTimer = setTimeout(() => {
      fit();
      // Mobile browser chrome resizes the viewport while reading: retain the position.
      if (!wasReading || desktop.matches) main.scrollTo({top: frameTop(target), behavior: 'instant'});
      update();
    }, 100);
  });
  const settle = () => {if (moving) {cancelMove(); main.scrollTo({top: frameTop(target), behavior: 'instant'}); body.classList.remove('deck-moving');}};
  addEventListener('beforeprint', settle);
  document.addEventListener('visibilitychange', () => {if (document.hidden) settle();});
  new MutationObserver(() => {
    const next = body.classList.contains('exporting');
    if (next === exporting) return;
    exporting = next; settle();
    if (!next) {fit(); main.scrollTo({top: frameTop(target), behavior: 'instant'}); update();}
  }).observe(body, {attributes: true, attributeFilter: ['class']});
  syncPreference(); fit();
  target = fromHash(); main.scrollTo({top: frameTop(target), behavior: 'instant'}); update();
  document.fonts.ready.then(() => {fit(); schedule();});
})();
