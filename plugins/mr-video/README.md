# mr-video

GitLab MR에 넣을 **자막 설명 영상**(요청하면 음성 포함)을 만드는 플러그인. Claude Code(`/mr-video:mr-video`)나
Codex(`$mr-video`)에서 "MR에 설명 영상 넣어줘"라고 하면, 변경 내용과 MR 본문을 읽고 영상을 만들어
**MR 본문 맨 위에** 넣는다.

![mr-video 예시 출력: 동작 경로 → 코드 변경 장면](../../docs/media/mr-video/demo.gif)

소개 영상(82초): [intro.mp4](../../docs/media/mr-video/intro.mp4) ·
설계: [docs/mr-video/design.md](../../docs/mr-video/design.md)

## 동작

1. AI가 diff와 MR 본문을 읽고 장면 계획(`plan.json`)을 쓴다.
2. `validate`가 스키마와 **코드 장면이 base/head 커밋의 실제 코드와 같은지** 검사한다.
3. `render`가 mermaid를 PNG로 그리고 Revideo(headless Chromium)로 렌더한 뒤, 인코딩된 MP4를 QA한다.
4. `upload`로 GitLab에 올리고, MR 본문의 마커 블록만 교체한다. 저장 후 본문을 바이트 단위로 대조한다.
   본문 저장은 GitLab MCP가 있으면 MCP로, 없으면(Codex) `save-description`(GitLab API)으로 한다.

장면 종류: `title` · `flow` · `mermaid`(노드 강조, 강조한 곳으로 화면 이동) · `code`(before → after 모핑) ·
`table`(수정 전/후, 설계 결정 비교) · `terminal` · `tests` · `checklist` · `clip`(웹 화면 녹화).

- 테마: 기본은 라이트. 요청 뒤에 `dark`를 붙이면 다크로 그린다(`/mr-video:mr-video dark`, `$mr-video dark`).
- 음성: 요청 뒤에 `voice`를 붙이면 Windows 기본 한국어 음성(오프라인)으로 자막을 읽고, 자막은 읽기가 끝날 때까지 유지한다.
  식별자처럼 읽기 어려운 자막은 `say`로 읽을 문장을 따로 줄 수 있다.
- 구조·흐름이 바뀐 MR은 mermaid 다이어그램을 적극적으로 쓴다(본문에 없으면 코드에서 직접 그림).
- `.uasset`·`.umap`이 바뀌면 VibeUE로 블루프린트·위젯을 읽어 변경 전/후를 mermaid로 비교한다.
  에디터가 꺼져 있거나 비교할 수 없으면 그 사실을 영상에 밝힌다.
- 웹 기능을 바꾼 MR이면 실행 중인 localhost 개발 서버에서 바뀐 기능을 써 보는 화면을 녹화해 넣는다.
  mr-video 전용 브라우저 프로필을 쓰고, 로그인은 개발용 수단을 찾거나 사용자가 직접 로그인할 창을 연다.

## 요구 사항

- Windows (맑은 고딕·Consolas 시스템 폰트), Node.js, git.
- `GITLAB_HOST`, `GITLAB_TOKEN`(api 스코프 PAT) 환경 변수. `setx`로 등록하면 재시작 전 세션에서도 읽는다.
- 첫 실행 때 `scripts/bin/setup.mjs`가 `scripts/` 아래에 npm 의존성(Revideo, mermaid, Chromium 등)을 설치한다.
  플러그인을 업데이트하면 다시 설치된다.

## CLI

`node scripts/bin/mr-video.mjs <명령>` (인자 없이 실행하면 사용법).

| 명령 | 하는 일 |
|---|---|
| `schema` | plan JSON Schema |
| `workdir --project p (--iid N \| --branch B)` | `%LOCALAPPDATA%\mr-video\...` 작업 폴더 |
| `validate plan.json --repo <dir>` | 스키마·길이·근거(base/head 파일 대조) 검사 |
| `render plan.json` | mermaid PNG 준비 + 렌더 + 후처리 + QA |
| `preview video.mp4 plan.json` | 장면별 프레임 시트 `preview.png` |
| `record steps.json --out clip.mp4` | localhost 웹 화면을 스크립트대로 조작하며 녹화(1280×720 mp4) |
| `login-window --url <localhost 주소>` | 녹화용 프로필로 브라우저 창을 열어 사용자가 직접 로그인 |
| `upload video.mp4 --project p` | GitLab 업로드 → markdown/url |
| `description --project p --iid N --out body.md` | MR 본문을 API로 바이트 그대로 저장 (+ head·diff base SHA) |
| `body --current body.md --upload upload.json --plan plan.json` | MR 본문에 마커 블록 삽입/교체 |
| `save-description --project p --iid N --current body.md` | GitLab MCP가 없는 호스트용 본문 저장 + 대조 |
| `same a.md b.md` | 저장 전후 본문 대조(CRLF·BOM·끝 공백만 무시) |

## 개발

```powershell
cd plugins\mr-video\scripts
node bin\setup.mjs                 # 의존성 설치 (npm ci)
npm test                           # 단위 테스트
npm run test:render                # 실제 렌더 스모크 (수 분)
npm run typecheck
npx tsx tools\readme-media.mts     # README 영상·GIF 다시 만들기 (docs/media/mr-video/)
```

## 알려진 사항

- Revideo 0.11이 Chromium에 `--single-process`를 강제해 Windows에서 크래시 → `scripts/patches/`로 제거.
- Revideo `findFirstRange(string)`은 문자열을 이스케이프 없이 정규식으로 쓴다 → `src/regex.ts`.
- Revideo `variables` 주입은 백틱·`${}`를 이스케이프하지 않는다 → plan을 base64로 전달.
- mermaid의 HTML 라벨(`<br/>`)은 canvas를 오염시키므로 Chromium에서 PNG로 미리 그린다.
- 렌더할 때 Revideo 텔레메트리를 끈다(`DISABLE_TELEMETRY=true`).
- 업로드한 영상 URL은 브라우저 로그인 세션으로만 열린다.
- 녹화용 브라우저 프로필은 `%LOCALAPPDATA%\mr-video\browser-profile`에 있다. `login-window` 창이 열려 있는 동안에는
  `record`가 같은 프로필을 쓸 수 없다(창은 사용자가 닫거나 9분이 지나면 닫힌다).
- `login-window`는 사용자가 직접 연 터미널에서 실행한다(에이전트가 띄운 창은 화면에 안 보일 수 있다). 창이 열려 있는 동안
  로컬 앱 쿠키(닫으면 사라지는 세션 쿠키 포함)를 프로필 폴더의 `mr-video-session.json`에 저장하고 `record`가 다시 넣는다.
- 녹화 중에는 팝업·새 탭을 막고, 어느 프레임이든 localhost 밖 문서로 이동하면 녹화를 중단한다.
- 화면 녹화(screencast)는 화면이 바뀔 때만 프레임을 받으므로, 페이지에 보이지 않는 1px 요소를 매 프레임 바꿔 마지막 화면까지 녹화한다.
