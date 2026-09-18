#!/usr/bin/env python3
"""Export the actual web artboards, not a second print design.

python scripts/export_pdf.py [--browser /path/to/chromium]
The browser must have a Korean font installed. No font files are distributed.
"""
from __future__ import annotations
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import shutil
import sys
import fitz
from playwright.sync_api import sync_playwright
from make_preview import build_preview

ROOT=Path(__file__).resolve().parent.parent
WIDTH,HEIGHT=1120,630

def finalize(path:Path,items:list[dict],handout:bool=False)->None:
    doc=fitz.open(path)
    lookup={item['id']:n for n,item in enumerate(items)}
    for pg in doc:
        if not handout:
            # Chromium can round physical paper size up by <1px. Crop only its blank bottom edge.
            pg.set_cropbox(fitz.Rect(0,0,WIDTH*.75,HEIGHT*.75))
        for lnk in pg.get_links():
            dest=lnk.get('nameddest','')
            if dest in lookup:
                n=lookup[dest];pg.delete_link(lnk)
                pg.insert_link({'kind':fitz.LINK_GOTO,'from':lnk['from'],
                    'page':n//2 if handout else n,
                    'to':fitz.Point(0,0)})
    toc=[];previous=None
    for n,item in enumerate(items):
        level=2 if previous==item['project'] else 1
        previous=item['project']
        toc.append([level,item['title'],n//2+1 if handout else n+1])
    doc.set_toc(toc)
    doc.set_metadata({'title':'정승호 포트폴리오 · '+('A4 2슬라이드' if handout else '16:9 슬라이드'),
        'author':'정승호','creator':'Portfolio web artboards / Chromium','subject':'화면과 동일한 페이지 디자인'})
    tmp=path.with_suffix('.tmp.pdf');doc.save(tmp,garbage=4,deflate=True);doc.close();tmp.replace(path)

def geometry_script(selector):
    return '''() => [...document.querySelectorAll(SELECTOR)].map(s=>{
      const r=s.getBoundingClientRect(),f=s.querySelector('.slide-footer').getBoundingClientRect();
      return {id:s.id,width:r.width,height:r.height,
        footerTop:f.top-r.top,
        bodyBottom:Math.max(...[...s.querySelector('.slide-body').children].map(c=>c.getBoundingClientRect().bottom))-r.top,
        text:s.innerText,
        styles:[...s.querySelectorAll('h1,h2,h3,p,img')].map(e=>{let c=getComputedStyle(e),b=e.getBoundingClientRect();return{tag:e.tagName,font:c.fontSize,family:c.fontFamily,line:c.lineHeight,width:b.width,height:b.height,x:b.left-r.left,y:b.top-r.top};})
      };
    })'''.replace('SELECTOR',json.dumps(selector))

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--browser');ap.add_argument('--review',type=Path)
    args=ap.parse_args()
    review=args.review or ROOT/'qa';review.mkdir(parents=True,exist_ok=True)
    html=build_preview(include_pdfs=False)
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=args.browser or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox'])
        page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1,reduced_motion='reduce')
        page.set_content(html,wait_until='load');page.evaluate('document.fonts.ready')
        page.evaluate('Promise.all([...document.images].map(i=>i.decode()))')
        items=page.evaluate("()=>Portfolio.slides.map(s=>({id:s.id,project:s.dataset.project,title:s.querySelector('h2')?.textContent||'정승호 소개'}))")
        before=page.evaluate(geometry_script('main .slide'))
        if args.review:
            page.screenshot(path=str(review/'web-desktop.png'))
            for item in items:
                loc=page.locator('#'+item['id']);loc.scroll_into_view_if_needed();page.wait_for_timeout(120)
                loc.screenshot(path=str(review/f"web-{item['id']}.png"))
        # Screen CSS is preserved, including type, image placement, borders, and colors.
        page.evaluate('Portfolio.setExportMode(true)');page.emulate_media(media='screen')
        exported=page.evaluate(geometry_script('main .slide'))
        for a,b in zip(before,exported):
            assert a['styles']==b['styles'],f"Screen/export geometry differs: {a['id']}"
            assert b['bodyBottom']<=b['footerTop']-5,f"Text overlaps footer: {b['id']}"
            assert b['height']==HEIGHT and b['width']==WIDTH
        if args.review:
            for item in items:
                loc=page.locator('#'+item['id']);loc.scroll_into_view_if_needed();page.wait_for_timeout(100)
                loc.screenshot(path=str(review/f"canonical-{item['id']}.png"))
        page.pdf(path=str(ROOT/'slides.pdf'),width=f'{WIDTH}px',height=f'{HEIGHT}px',print_background=True,prefer_css_page_size=True,display_header_footer=False,tagged=True)
        # Browser two-up uses exactly the same cloned slide, with proportional outer zoom only.
        page.evaluate('Portfolio.setExportMode(false);Portfolio.setOutputMode("handout")')
        page.emulate_media(media='print');page.evaluate('document.fonts.ready')
        page.pdf(path=str(ROOT/'handout.pdf'),prefer_css_page_size=True,print_background=True,display_header_footer=False,tagged=True)
        browser.close()
    for filename,handout in [('slides.pdf',False),('handout.pdf',True)]:finalize(ROOT/filename,items,handout)
    with fitz.open(ROOT/'slides.pdf') as one,fitz.open(ROOT/'handout.pdf') as two:
        assert len(one)==len(items),(len(one),len(items))
        assert len(two)==(len(one)+1)//2
        chars=lambda t:Counter(re.sub(r'\s+','',t))
        for n,pg in enumerate(two):
            expected=''.join(one[i].get_text() for i in range(2*n,min(2*n+2,len(one))))
            assert not chars(expected)-chars(pg.get_text()),f'Missing text on handout page {n+1}'
        sizes={'slide_pages':len(one),'handout_pages':len(two),'slide_size_pt':list(one[0].rect),'handout_size_pt':list(two[0].rect)}
    (review/'export-check.json').write_text(json.dumps({'sizes':sizes,'screen_export_geometry_identical':True,'slides':[{k:v for k,v in i.items() if k not in ('styles','text')} for i in exported]},ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(sizes,ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception as exc:print(f'Export failed: {exc}',file=sys.stderr);raise
