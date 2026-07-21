# AltBrief — 설치 없는 자동 뉴스 앱

이 버전은 회사 PC에서 `.bat`, PowerShell, Node.js, npm을 전혀 실행하지 않습니다.
브라우저에서 GitHub에 파일을 올리면 GitHub 서버가 뉴스 수집과 앱 배포를 처리합니다.

## 준비물

- 무료 GitHub 계정 1개
- 이 폴더의 파일
- Chrome 또는 Edge 브라우저

## 배포 순서

### 1. GitHub 저장소 만들기

1. GitHub 로그인
2. 오른쪽 위 `+` → `New repository`
3. Repository name: `altbrief`
4. 반드시 `Public` 선택
5. `Create repository` 클릭

공개 저장소에는 앱 코드와 공개 뉴스 데이터만 들어갑니다. 회사 내부자료나 개인정보는 넣지 마세요.

### 2. 파일 업로드

1. 생성된 빈 저장소에서 `uploading an existing file` 클릭
2. 압축을 푼 이 폴더 안의 항목을 모두 선택
3. 브라우저 업로드 영역에 드래그
4. 아래 `Commit changes` 클릭

업로드 대상:
- `.github` 폴더
- `scripts` 폴더
- `site` 폴더
- `README_KR.md`

중요: 바깥쪽 폴더 자체가 아니라, 폴더 안의 위 항목들을 올리세요.

### 3. GitHub Pages 켜기

1. 저장소 상단 `Settings`
2. 왼쪽 `Pages`
3. `Build and deployment`의 Source를 `GitHub Actions`로 선택

### 4. 자동 실행 확인

1. 저장소 상단 `Actions`
2. 왼쪽 `Update News and Deploy AltBrief`
3. `Run workflow` → 초록색 `Run workflow`
4. 1~3분 후 실행 항목에 초록 체크가 표시되는지 확인

### 5. 공유 URL 확인

1. `Settings` → `Pages`
2. 상단에 표시되는 URL 확인

예상 형태:

`https://본인아이디.github.io/altbrief/`

이 URL만 부서원에게 공유하면 됩니다. 이후 사용자는 프로그램을 실행할 필요가 없습니다.

## 자동 업데이트

GitHub Actions가 3시간마다 공개 RSS 뉴스를 수집하고 앱을 다시 배포합니다.
앱의 `최신 데이터 확인` 버튼은 이미 배포된 최신 JSON을 다시 불러옵니다.

## 휴대폰 설치

- iPhone: Safari → 공유 → 홈 화면에 추가
- Galaxy: Chrome → 메뉴 → 앱 설치 또는 홈 화면에 추가

## 수정할 파일

- 화면 문구: `site/index.html`
- 디자인: `site/styles.css`
- 검색·필터 동작: `site/app.js`
- 뉴스 검색어: `scripts/update_news.py`의 `FEEDS`
- 자동 실행 주기: `.github/workflows/update-and-deploy.yml`의 `cron`

## 문제 해결

### Actions에 workflow가 안 보임
`.github/workflows/update-and-deploy.yml`이 정확한 위치에 올라갔는지 확인하세요.

### Pages URL이 안 생김
`Settings → Pages → Source → GitHub Actions`로 설정한 뒤 Actions에서 다시 실행하세요.

### 앱에 예시 뉴스만 보임
`Actions`에서 최신 실행을 열고 `Collect public RSS news` 단계의 오류를 확인하세요. 첫 실행에는 몇 분이 걸릴 수 있습니다.

### 회사에서 GitHub 접속이 차단됨
회사 보안정책 문제입니다. 개인 PC나 승인된 외부 환경에서 최초 배포한 뒤 생성된 `github.io` URL만 회사에서 사용하세요. URL 접속도 차단되면 사내 IT 승인 또는 사내 서버 배포가 필요합니다.

## 데이터 정책

- 공개 RSS의 제목·출처·링크를 이용합니다.
- 로그인이나 유료 구독을 우회하지 않습니다.
- 기사 전문을 저장하지 않습니다.
- 규칙 기반 분류와 시사점은 참고용이며 원문 검토가 필요합니다.
