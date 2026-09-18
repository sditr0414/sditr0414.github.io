# 포트폴리오 관리 안내

## 로컬 실행

저장소 루트에서 실행합니다. 웹사이트 실행에는 npm 설치나 빌드가 필요하지 않습니다.

```sh
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다. `index.html`을 직접 열어도 됩니다.

## 파일 수정과 배포

- 내용: `index.html`
- 스타일: `assets/css/styles.css`
- 목차·이미지 확대·출력 동작: `assets/js/app.js`
- 사진·화면 캡처: `assets/images/`
- 시연 영상: `assets/videos/`

`main` 브랜치의 루트에서 GitHub Pages로 배포합니다. `.nojekyll`을 유지하며 파일 경로는 대소문자를 구분합니다.

사이트 주소는 `https://sditr0414.github.io/`입니다. 기존 다운로드 링크를 유지하기 위해 PDF와 QR 파일은 루트에 둡니다. 주소가 바뀌지 않으면 내용을 수정해도 QR을 다시 만들 필요가 없습니다.

## PDF와 인쇄

상단 ‘PDF 저장’은 브라우저 인쇄창에서 16:9 슬라이드를 준비합니다. ‘PDF로 저장’을 선택하고 배경 그래픽을 켜고 머리글·바닥글을 끕니다.

Ctrl/Cmd+P는 A4 세로 두 슬라이드 출력을 준비합니다. **A4 / 세로 / 용지당 1페이지 / 배율 100%**로 설정합니다. 한 페이지에 두 슬라이드가 이미 배치되어 있으므로 용지당 2페이지를 다시 선택하지 않습니다.

미리 생성한 PDF는 웹페이지 하단에서 내려받을 수 있습니다. 본문이나 슬라이드 디자인을 수정하면 다운로드용 PDF도 다시 생성합니다.

## 출력 파일 생성

Python, Chromium, 한국어 표시가 가능한 글꼴이 필요합니다. 저장소 루트에서 가상 환경을 만든 뒤 실행합니다.

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python -m playwright install chromium
.venv/bin/python scripts/export_pdf.py
.venv/bin/python scripts/make_preview.py preview.html
```

설치된 Chromium을 지정하려면 `export_pdf.py --browser /path/to/chromium`을 사용합니다. PDF는 루트에, 검사 결과는 `work/qa/`에 저장됩니다. `preview.html`은 이미지·영상·PDF를 포함한 단일 HTML입니다. 임시 출력과 가상 환경은 Git에서 제외합니다.

## 변경 확인

PC와 모바일에서 내용 넘침, 목차 이동, 이미지 확대, 갤러리, 시연 영상과 PDF 링크를 확인합니다. 공개 사이트의 사진과 문서는 누구나 접근할 수 있으므로 공개할 자료만 포함합니다.
