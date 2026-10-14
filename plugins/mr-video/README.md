# mr-video

GitLab MR에 넣을 **자막 설명 영상**(음성 없음)을 만드는 플러그인. Claude Code(`/mr-video:mr-video`)나
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
`table`(수정 전/후, 설계 결정 비교) · `terminal` · `tests` · `checklist`.

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
