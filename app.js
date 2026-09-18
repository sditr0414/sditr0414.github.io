'use strict';
(() => {
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
  const dialog = $('#media-dialog');
  const media = $('#dialog-content');
  const title = $('#dialog-title');
  const controls = $('#gallery-controls');
  const imageSizeToggle = $('#image-size-toggle');
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
    ['assets/cad-assembly.webp','SolidWorks 어셈블리 모델링 · 전공 실습'],
    ['assets/cad-train.webp','SolidWorks 파트·어셈블리 모델링 · 전공 실습'],
    ['assets/cae-structure.webp','Ansys 구조 해석 · 전공 실습'],
    ['assets/cae-modal.webp','Ansys 진동 해석 · 전공 실습']
  ];
  let galleryIndex = 0, lastFocus = null;
  function openDialog(label) {
    lastFocus = document.activeElement;
    title.textContent = label;
    dialog.showModal();
    $('#dialog-close').focus();
  }
  function showImage(src, label, isGallery = false) {
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
    const video = document.createElement('video');
    video.src = button.dataset.video; video.controls = true; video.playsInline = true;
    video.preload = 'metadata'; video.setAttribute('aria-label',button.dataset.title);
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

  // A quiet floating index keeps the current project visible without repeating its page header.
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
    $('#mobile-count').textContent=`${String(index).padStart(2,'0')} / ${slides.length}`;
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
      console.error(error);notify('인쇄창을 열지 못했습니다. 페이지 아래의 완성된 PDF를 내려받아 주세요.');
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
  window.Portfolio={preparePrint,printPortfolio,setExportMode,
    setOutputMode(mode){requestedMode=mode;return preparePrint(mode);},get slides(){return slides;}};
})();
