# 정승호 포트폴리오

로봇 제어 · 비전 · 임베디드

<p>
  <a href="https://sditr0414.github.io/"><b>포트폴리오 사이트 열기 →</b></a>
  &nbsp;·&nbsp;
  <a href="https://sditr0414.github.io/portfolio-submission/">제출용 슬라이드·PDF</a>
</p>

시연 영상, 진행 과정, 검증 결과는 사이트에서 프로젝트별로 볼 수 있습니다.

## 프로젝트

| | 프로젝트 | 내용 | 주요 기술 |
| :-: | --- | --- | --- |
| 01 | [비전 기반 로봇팔 티칭·검사](https://sditr0414.github.io/#opencv) | 지그 위치에 맞춘 로봇팔 동작 보정과 부품·안착 상태 검사 | YOLO, OpenCV, FK·IK, ROS2, Raspberry Pi5 |
| 02 | [원격 물품 회수·운반 로봇](https://sditr0414.github.io/#robot) | 스마트폰으로 이동하며 물품을 집어 옮기는 4륜 로봇 | STM32, FreeRTOS, Flutter |
| 03 | [AI 기반 보행 보조 장치](https://sditr0414.github.io/#vision) | 사람·차량·장애물과 지면을 인식해 보행 위험을 안내하는 장치 | YOLO, TFLite INT8, Raspberry Pi5 |
| 04 | [PLC 기반 창고 적재 제어](https://sditr0414.github.io/#plc) | 금속·비금속 소재 분류와 1–4층 창고 병렬 적재 공정 | Mitsubishi Q 시리즈, GX Works2, HMI |
| 05 | [노크 위치 탐지 연구](https://sditr0414.github.io/#thesis) | 진동 센서 8개로 9개 구역 중 두드린 위치 판별 | MATLAB, FFT, K-NN, SVM |
| 06 | [Travel Visualizer](https://sditr0414.github.io/#travel) | 여행 사진과 이동 기록을 지도 위 경로로 잇는 웹앱 | React, TypeScript, MapLibre |

## 모바일로 보기

<a href="https://sditr0414.github.io/"><img src="docs/assets/qr/portfolio-qr.png" alt="포트폴리오 사이트 QR 코드" width="140" height="140"></a>

## 팔레트 검출률의 평가 조건

사진별로 1회 처리한 **단일 이미지 검출률**입니다. 실제 촬영 이미지 304장 중 팔레트가 평가 영역 안에 있는 285장에서 외곽선 검출 226/285장(79.3%), AI+외곽선 230/285장(80.7%), AI+CAD 정합 284/285장(99.6%)을 검출했습니다.

학습·검증·테스트 사진을 포함한 개발 과정의 비교이며 독립 테스트 결과가 아닙니다. 재관측·재시도는 포함하지 않습니다. 1회 처리는 검출 파이프라인을 사진당 한 번 실행한다는 뜻이며 내부 CAD 정합의 반복 계산까지 한 번이라는 뜻은 아닙니다. 위치·각도 정확도나 실제 조립·하차 공정 성공률과 구분합니다.
