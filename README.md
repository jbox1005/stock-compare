# 주가 괴리율 비교 PWA

두 종목(기본: 현대차 · 현대차2우B)의 종가와 괴리율(우선주 ÷ 보통주 − 100%)을
일 / 주 / 월 / 년 단위로 비교하는 서버리스 PWA.

**앱 주소:** https://jbox1005.github.io/stock-compare/

| 단위 | 기간 |
|---|---|
| 일 | 최근 6개월 |
| 주 | 최근 1년 |
| 월 | 최근 3년 |
| 년 | 최근 10년 |

## 동작 방식

- GitHub Actions가 **평일 16:20 KST**에 네이버 금융 시세 API에서 종가를 수집해
  `data/*.json`으로 커밋한다 (`.github/workflows/update-data.yml`).
- 앱은 GitHub Pages에서 정적 JSON만 읽는다 — 별도 서버 없음.
- 수집 대상 종목은 `symbols.json`에 나열한다. 이 파일이 변경되면 워크플로가
  자동 실행되어 새 종목 데이터를 수집한다.

## 종목 변경

앱의 설정(⚙︎)에서 두 종목을 선택한다. 목록에 없는 종목은:

1. `symbols.json`에 종목코드를 추가하고 커밋하거나 (설정 화면의 "GitHub에서 직접 편집" 링크),
2. 설정 화면에 GitHub 토큰(repo 권한)을 입력하면 앱이 자동으로 추가한다.

1~2분 후 데이터 수집이 끝나면 앱에 표시된다.

## 아이폰 설치

Safari로 앱 주소 접속 → 공유 버튼 → **홈 화면에 추가**.

## 로컬 개발

```sh
node scripts/fetch-data.mjs   # data/ 생성
python -m http.server 8931    # http://127.0.0.1:8931
```
