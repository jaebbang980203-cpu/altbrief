현재 GitHub 저장소에는 폴더가 풀려서 업로드되어 있습니다.
이 패키지는 모든 파일을 저장소 최상단(root)에 두어도 작동하도록 수정한 버전입니다.

1) 이 ZIP을 압축 해제합니다.
2) GitHub 저장소에서 Add file > Upload files를 누릅니다.
3) 아래 파일들을 모두 올려 기존 파일을 교체합니다.
   index.html, app.js, styles.css, manifest.json, sw.js,
   news.json, icon-192.png, icon-512.png, update_news.py, .nojekyll
4) Commit changes를 누릅니다.
5) Settings > Pages에서 Source를 Deploy from a branch로 선택합니다.
6) Branch: main / Folder: /(root) 선택 후 Save합니다.
7) 1~3분 뒤 Pages URL이 생깁니다.
8) 자동수집 설정은 Actions > New workflow > set up a workflow yourself에서
   파일명을 update-news.yml로 하고 WORKFLOW_COPY_PASTE.txt의 내용을 붙여넣어 저장합니다.
9) Actions > Update AltBrief News > Run workflow를 눌러 첫 수집을 실행합니다.
