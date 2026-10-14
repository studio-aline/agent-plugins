# mr-video 설계

작성일: 2026-10-13

## 목적

GitLab에 MR을 올릴 때, 작성자가 **자신이 변경·구현한 내용**을 설명하는
짧은 영상을 MR 본문에 바로 넣는다. 보는 사람은 **동료 프로그래머(리뷰어)**다.
작성자가 AI(Claude Code)에게 **명시적으로 요청할 때만** 동작한다.

## 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 렌더 엔진 | Revideo 0.11 (Motion Canvas 포크, MIT) | 코드 diff 모핑·줄 선택이 기본 제공, 헤드리스 `renderVideo()` |
| 제외 | Remotion | 회사 규모상 유료 라이선스 |
| 음성 | 없음, 자막만 | 사무실에서 소리 없이 시청 |
| 실행 위치 | 작성자 로컬 Windows PC만 | 시스템 폰트(맑은 고딕, Consolas) 사용 가능 |
| 형태 | Claude Code 스킬 + `mr-video` CLI | MCP 서버는 필요해질 때 CLI 래퍼로 추가 |
| 업로드 인증 | PAT(`api` 스코프)를 `GITLAB_TOKEN` 환경 변수로 | GitLab 내장 MCP는 OAuth라 토큰 재사용 불가 |
| 확인 단계 | 없음, 호출 시 끝까지 자동 진행 | 사용자 선택 |
| 언어 | MR 하나당 C++ 또는 Elixir 하나 | `@lezer/cpp`, `lezer-elixir` |

## 스파이크 결과 (2026-10-13, 이 PC)

- 40초 영상 렌더 15초, 71초 영상 23초(1워커). 4워커는 더 느림 → 1워커 고정.
- 후처리 후 40초 = 0.49MB.
- Windows에서 Revideo가 강제하는 `--single-process`로 Chromium이 크래시 → 패치 필요.
  `headless: 'shell'`(chrome-headless-shell) 사용.
- `@revideo/ui`가 의존성 목록에 없어서 직접 설치해야 함.
- 출력에 무음 AAC 트랙과 `yuvj420p` → 번들 ffmpeg로 후처리(`-an`, `yuv420p`, `+faststart`).
- 비트 단위 결정성은 없음(PSNR 56dB, SSIM 0.9998로 육안 동일).
- 텔레메트리(PostHog)는 `DISABLE_TELEMETRY=true`로 끔.
- Revideo는 `variables`를 템플릿 리터럴로 주입하면서 백틱과 `${`를 이스케이프하지 않음
  → plan은 **base64 문자열**로 전달.
- Elixir 코드 장면에서 `highlight` 줄이 밝아지지 않는 문제 관찰 → 회귀 테스트로 확인 후 수정.
- 코드 17줄에서 카드가 제목을 가림 → 카드 크기를 측정해 영역에 맞게 축소.

## 구성요소

### `mr-video` CLI

| 명령 | 동작 |
|---|---|
| `mr-video schema` | plan JSON Schema 출력 |
| `mr-video workdir --project <path> (--iid N \| --branch B)` | `%LOCALAPPDATA%\mr-video\<project>\<iid 또는 branch>\` 생성 후 경로 출력 |
| `mr-video validate <plan.json> [--repo <dir>]` | 스키마 + 길이 + 근거 검사. 결과 JSON, 오류 시 종료 코드 1 |
| `mr-video render <plan.json>` | 렌더 → 후처리 → QA → 결과 JSON(경로, 길이, 크기, sha256) |
| `mr-video preview <video.mp4> <plan.json>` | 장면별 마지막 프레임을 모은 `preview.png` |
| `mr-video upload <video.mp4> --project <path>` | `GITLAB_HOST`/`GITLAB_TOKEN`으로 업로드, 결과 JSON(markdown, url) |
| `mr-video body --current <file> [--upload <json> --plan <plan.json>] [--inspect]` | MR 본문에 마커 블록을 삽입/교체한 새 본문 출력. `--inspect`는 기존 블록 유무와 SHA 출력 |

### `mr-video` 스킬

명시적 호출(`/mr-video`, "MR에 설명 영상 넣어줘")에만 동작한다.

1. 근거 수집: base/head SHA, `git diff base..head`, 바뀐 함수, 이 세션에서 **실제로 실행한** 테스트.
2. plan.json 작성(장면 규칙 준수) → `validate` 실패 시 최대 3회 수정.
3. `render` → `preview` PNG를 직접 보고 이상하면 plan 수정 후 재렌더.
4. `upload`.
5. GitLab MCP로 MR 본문 읽기 → `body`로 새 본문 생성 → `save_merge_request`로 저장
   (MR이 없으면 생성).
6. MR 링크, 영상 길이, 기준 SHA를 보고.

## plan 스키마

```json
{
  "mr": {"project": "group/repo", "iid": 1234, "branch": "feature/x", "base": "<sha>", "head": "<sha>"},
  "title": "아이템 스택 병합 시 수량 유실 수정",
  "lang": "cpp",
  "scenes": [ ... ]
}
```

- `base`, `head`: 7~40자리 16진수 SHA. 헤더에는 `head` 앞 7자리.
- `iid`는 MR이 아직 없으면 생략하고 `branch` 사용.
- `lang`: `"cpp" | "elixir"`. 바뀐 파일 확장자(`.cpp .cc .h .hpp .inl` / `.ex .exs`)와 맞아야 한다.

### 장면 타입

| type | 필드 | 자막별 동작 |
|---|---|---|
| `title` | `title`, `summary?` | 첫 자막에 등장 |
| `flow` | `title`, `nodes: string[]`(2~5), `changed?: number[]`, `broken?: number[]` | 노드를 자막 수에 고르게 나눠 등장, 마지막 자막에서 changed/broken 강조 |
| `code` | `title`, `file`, `before?`, `after`, `highlight?` | ① before(없으면 after) 표시 ② after로 모핑 ③ highlight 강조 |
| `tests` | `title`, `ran: {name, result: "pass"\|"fail"}[]`, `notRun: string[]` | ① 실행한 것 ② 실행 안 한 것 |
| `checklist` | `title`, `items: string[]`(1~5) | 자막마다 한 항목, 남은 항목은 마지막 자막에 |

공통:

- `captions: string[]` 1~4개, 각 60자 이하.
- 자막 길이 = `max(2.2, 글자수 / 12 + 0.9)`초. 자막은 컷에서 즉시 교체(크로스페이드 없음).
- 장면 3~7개, 전체 180초 초과 시 거부(목표 45~120초).
- 코드 스니펫 20줄 초과 또는 한 줄 100자 초과 시 거부, 14줄 초과 시 경고.

### 근거 검사

- `code.before`는 `git show <base>:<file>`에, `code.after`는 `git show <head>:<file>`에
  부분 문자열로 존재해야 한다(CRLF→LF 정규화).
- `highlight`는 `after`의 부분 문자열이어야 한다.
- `file`이 `git diff --name-only base head`에 없으면 경고.

## MR 본문 블록

```markdown
<!-- mr-video:start -->
## 🎬 설명 영상
![설명 영상 · abc1234](/uploads/<hash>/mr-1234-abc1234.mp4)
> `abc1234` 기준 · 52초 · 자막 전용 · mr-video 생성
<!-- mr-video:end -->
```

- 마커가 있으면 그 블록만 교체, 없으면 본문 맨 앞에 삽입. 나머지 본문은 보존.
- 파일 이름 `mr-<iid 또는 branch slug>-<sha7>.mp4`.
- 다시 호출하면 블록의 SHA와 MR head를 비교해 옛 영상인지 알려주고 다시 생성.
- 옛 업로드 파일은 삭제하지 않는다.

## 실패 처리

업로드가 성공하기 전에는 MR을 건드리지 않는다.

| 단계 | 실패 시 |
|---|---|
| validate | 최대 3회 plan 수정, 이후 실패 항목 보고 |
| render/QA | 에러 보고 후 중단 |
| upload | 401/403(토큰), 413(용량)을 명확한 메시지로 |
| MR 갱신 | 생성된 마크다운 블록을 출력해 수동 붙여넣기 가능하게 |

## 테스트

| 종류 | 대상 |
|---|---|
| 단위(vitest) | 스키마, 길이 계산, 언어 판별, 본문 블록 삽입/교체/보존, 파일 이름, base64 왕복 |
| 근거 검사 | 임시 git 레포(base/head 커밋)로 일치·불일치 |
| 렌더 스모크 | C++/Elixir 예제 렌더 → 프레임 수 = fps × 길이, 디코드 오류 없음, preview 생성 |
| 강조 회귀 | 강조 줄 영역이 흐린 줄보다 밝은지 프레임 픽셀로 확인 |
| 업로드 | 로컬 목 HTTP 서버로 multipart 형식과 401/413 메시지 |
| 수동 1회 | 테스트 프로젝트 MR에서 GitLab 인라인 재생 확인 |
