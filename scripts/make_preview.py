#!/usr/bin/env python3
"""Create a portable HTML preview. Asset files are embedded; font files are not."""
from __future__ import annotations
import argparse
import base64
import mimetypes
from pathlib import Path
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parent.parent

def build_preview(*, offline_fonts: bool=False, include_pdfs: bool=True) -> str:
    soup=BeautifulSoup((ROOT/'index.html').read_text(encoding='utf-8'),'html.parser')
    def data_uri(path: Path) -> str:
        path=path.resolve()
        if ROOT not in path.parents or not path.is_file(): raise FileNotFoundError(path)
        mime=mimetypes.guess_type(path)[0] or 'application/octet-stream'
        return f'data:{mime};base64,'+base64.b64encode(path.read_bytes()).decode('ascii')
    images={str(path.relative_to(ROOT)):data_uri(path) for path in (ROOT/'assets').rglob('*') if path.is_file() and path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.mp4'}}
    for link in soup.find_all('link',rel='stylesheet'):
        if link.get('href')=='assets/css/styles.css':
            style=soup.new_tag('style');style.string=(ROOT/'assets/css/styles.css').read_text(encoding='utf-8');link.replace_with(style)
        elif offline_fonts: link.decompose()
    for el in soup.find_all(True):
        for attr in ('src','data-image','data-video'):
            value=el.get(attr,'')
            if value.startswith(('assets/images/', 'assets/videos/')):
                if value not in images:raise FileNotFoundError(value)
                el[attr]=images[value]
        if include_pdfs and el.get('href') in ('slides.pdf','handout.pdf'):
            el['href']=data_uri(ROOT/el['href'])
    app=(ROOT/'assets/js/app.js').read_text(encoding='utf-8')
    for name,uri in images.items():
        app=app.replace("'"+name+"'","'"+uri+"'").replace('"'+name+'"','"'+uri+'"')
    script=soup.find('script',src='assets/js/app.js')
    replacement=soup.new_tag('script');replacement.string=app;script.replace_with(replacement)
    return str(soup)

if __name__=='__main__':
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('output',type=Path)
    args=ap.parse_args()
    args.output.write_text(build_preview(),encoding='utf-8')
    print(args.output)
