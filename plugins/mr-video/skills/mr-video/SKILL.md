---
name: mr-video
description: Render a subtitled explainer video of the author's own GitLab MR change and embed it at the top of the MR description. Use only when the user explicitly asks to put an explainer video into an MR (e.g. "/mr-video", "$mr-video", "MR에 설명 영상 넣어줘", "MR 올리면서 영상도").
---

# mr-video: MR 설명 영상

작성자가 **자신이 변경·구현한 내용**을 동료 프로그래머에게 설명하는 자막 영상(음성 없음)을 만들어
MR 본문 맨 위에 넣는다. 명시적으로 요청받았을 때만 실행하고, 요청받으면 **확인 없이 끝까지** 진행한다.

## CLI

이 `SKILL.md`가 있는 폴더를 `<skill>`이라 하면 CLI는 플러그인의 `<skill>/../../scripts/bin/mr-video.mjs`다.
아래에서는 `MRV`(= `node "<skill>/../../scripts/bin/mr-video.mjs"`)로 쓴다.

- 모든 명령은 stdout에 JSON을 내고, 실패하면 `{"ok":false,"error":...}`와 종료 코드 1을 낸다.
- **첫 실행(또는 플러그인 업데이트 직후)**에는 `{"needsSetup":true}`가 나온다. 그때 한 번
  `node "<skill>/../../scripts/bin/setup.mjs"`(npm ci, 1분 안팎)를 실행하고 원래 명령을 다시 실행한다.
  setup이 실패하면 오류를 보고하고 멈춘다.

## 전제

- Windows 전용이다(맑은 고딕·Consolas 시스템 폰트). Node.js와 git이 `PATH`에 있어야 한다.
- 환경 변수 `GITLAB_HOST`(예: `gitlab.example.com`), `GITLAB_TOKEN`(api 스코프 PAT). CLI가 프로세스 환경 변수,
  없으면 Windows 사용자 환경 변수(`setx`로 등록한 값)에서 읽는다. 둘 다 없으면 멈추고 사용자에게 설정을 요청한다.
  토큰 값을 출력하거나 대신 입력하지 않는다.
- MR 본문은 **읽을 때는 `MRV description`**(API로 바이트 그대로) 쓴다. 호스트의 도구 출력에서 본문을 옮겨 적지 않는다.
- 레포는 C++ 또는 Elixir 중 하나만 다룬다.
- 영상은 **푸시된 head 커밋** 기준이다. 커밋 안 된 변경이 있거나 푸시가 안 됐으면 먼저 사용자 요청 범위 안에서
  커밋·푸시 상태를 맞춘다(요청이 없으면 그 사실을 알리고 멈춘다).

## 절차

1. **대상 파악**
   - 프로젝트 경로(`group/repo`): `git remote get-url origin`에서 추출.
   - MR iid: 사용자가 준 URL에서 얻거나, GitLab MCP가 있으면 source branch로 MR을 찾는다. 둘 다 안 되면 MR URL을 묻는다.
   - 먼저 `git fetch origin <target>`. 그다음 `base` = `git merge-base origin/<target> HEAD`,
     `head` = `git rev-parse HEAD` (둘 다 전체 SHA).
   - MR이 이미 있으면 `MRV description --project <p> --iid N --out body.md`. 출력의 `baseSha`(MR diff 기준)를
     `base`로, `sha`를 head로 쓰고 로컬 HEAD와 같은지 확인한다.
     `MRV body --current body.md --inspect`로 기존 영상 SHA를 확인한다. 같은 head면 다시 만들지 않고 알린다.

2. **근거 수집**: `git diff base..head`, 바뀐 함수 전체, MR 본문, 이 세션에서 **실제로 실행한** 테스트와 결과.
   실행하지 않은 테스트를 통과했다고 쓰지 않는다.

3. **plan 작성**: `MRV workdir --project <p> (--iid N | --branch B)`가 준 폴더에 `plan.json`을 쓴다.
   스키마는 `MRV schema`.

4. **검증**: `MRV validate <plan.json> --repo <레포 루트>`. 실패하면 오류대로 고쳐서 최대 3회 재시도,
   그래도 실패하면 오류를 보고하고 멈춘다.

5. **렌더**: `MRV render <plan.json>` (분당 20~40초). `ok:false`면 `qa.problems`를 보고하고 멈춘다.

6. **자체 확인**: `MRV preview <video> <plan.json>`이 만든 `preview.png` 이미지를 직접 열어 본다.
   글자 겹침·잘림·빈 장면이 있으면 plan을 고쳐 4번부터 다시 한다.

7. **업로드**: `MRV upload <video> --project <p>` → 결과 JSON을 `upload.json`으로 저장.

8. **MR 본문 반영** (본문은 한 글자도 손으로 고치지 않는다)
   - 기존 MR은 1번의 `body.md`, 새 MR은 직접 쓴 설명 초안을 `body.md`로 쓴다.
   - `MRV body --current body.md --upload upload.json --plan plan.json --out body.new.md`
   - 기존 MR이면 저장 직전에 `MRV description ... --out body.check.md` 후 `MRV same body.md body.check.md`.
     다르면(그 사이 누가 고쳤음) `body.check.md`를 새 `body.md`로 삼아 위 단계를 다시 한다.
   - 저장:
     - **GitLab MCP가 있으면** `body.new.md`를 읽어 MR 저장 도구(예: `save_merge_request`)의 `description`에
       그대로 넣는다. 기존 MR은 `merge_request_iid`, 새 MR은 `title`·`source_branch`·`target_branch`를 준다.
     - **없으면** 기존 MR은 `MRV save-description --project <p> --iid N --current body.new.md`로 저장한다
       (저장 결과를 대조해 `ok`를 낸다). 새 MR은 만들 수 없으니 사용자에게 MR을 먼저 만들어 달라고 한다.
   - 저장 후 `MRV description ... --out body.saved.md` 후 `MRV same body.new.md body.saved.md`.
     다르면 `body.new.md`로 한 번 더 저장하고, 그래도 다르면 다른 줄 번호와 함께 사용자에게 보고한다.
   - 저장이 실패하면 `body.new.md`의 마커 블록을 출력해 사용자가 붙여넣을 수 있게 한다.

9. **보고**: MR 링크, 영상 길이, 기준 SHA(7자리), 경고가 있었다면 그 내용.

업로드 성공 전에는 MR을 건드리지 않는다. 마커 블록 밖의 본문은 절대 바꾸지 않는다.

## 장면 작성 규칙

보는 사람은 이 코드를 아는 동료다. 목표는 리뷰 전에 **변경의 모양**을 잡게 하는 것.

MR 본문이 있으면 **본문이 1차 재료**다. 작성자가 중요하다고 적은 내용은 웬만하면 영상에 담는다
(3~16장면, 큰 MR은 2~4분도 괜찮다).

장면 종류:

| type | 쓰는 곳 |
|---|---|
| `title` | 이 변경이 하는 일 한 문장. 함께 배포할 MR 같은 전제 |
| `flow` | 단순한 일직선 경로. 문제 지점 `broken`, 바뀐 지점 `changed` |
| `mermaid` | **본문의 mermaid 다이어그램은 코드를 그대로 가져와** 이 장면으로 만든다. flowchart는 `emphasis`(자막마다 `{accent, bad}` 노드·서브그래프 id)로 지금 설명하는 곳을 강조하고, 화면이 그곳으로 이동한다. sequence·ER은 강조 없이 쓴다 |
| `table` | 본문의 비교표, 특히 **"왜 이렇게 했는가"(대안 vs 채택)** 와 **수정 전 vs 수정 후**. 채택한 행은 `accentRow`, 바뀐 뒤 열은 `accentCol` |
| `code` | 핵심 변경. before→after 모핑, `highlight`로 요점 한 줄 |
| `terminal` | 마이그레이션·배포 명령처럼 실제로 칠 명령과 출력 (`lines: [{cmd, out?}]`, 최대 8줄). 출력은 실제로 본 것만 쓴다 |
| `tests` | 실행한 것 / 실행하지 않은 것. 본문 검증 기록을 옮기면 자막에 "본문 검증 기록 기준"이라고 밝힌다 |
| `checklist` | 배포·리뷰 시 확인할 곳 |

권장 흐름: 개요 → 수정 전 동작 → 수정 후 구조 → **수정 전/후 비교**(주기·경로·저장소가 어떻게 바뀌었나) →
핵심 코드 → 설계 결정의 이유(표) → 검증 → 배포·리뷰 포인트.

규칙:

- diff를 줄 단위로 읽어주지 않는다. **동작이 어떻게 바뀌었는지**를 설명한다.
- 수치가 바뀌면(예: 60초 → 5초, 두 경로 → 한 경로) 자막과 제목에 수정 전/후를 함께 쓴다.
- 장면 하나에 주장 하나. 자막 하나에 문장 하나, 60자 이하, 1~6개.
- mermaid 장면은 렌더 후 미리보기만 보지 말고, 자막마다 화면이 설명하는 곳을 비추는지 확인한다.
- mermaid 코드처럼 따옴표가 많은 값은 plan.json을 손으로 쓰지 말고 작은 생성 스크립트(JSON.stringify)로 만든다.
- 식별자·경로·API 이름은 원문 그대로 쓴다. 번역하거나 다듬지 않는다.
- `code.before`/`after`는 base/head 파일에서 **그대로 복사**한 연속 구간이다(validate가 확인한다).
  14줄 이하, 한 줄 100자 이하.
- `highlight`는 `after` 안의 정확한 문자열.
- "이 코드가 X를 한다"(코드로 확인 가능)와 "이게 사용자 문제를 고친다"(측정 전엔 가설)를 구분한다.
- 비밀값, 고객 데이터, 내부 호스트명은 자막과 코드에 넣지 않는다.
- 자막은 짧은 한국어 문장, 주어·서술어 일치, 번역투 금지.

### 테마

- plan 최상위 `theme`: `"light"`(기본) 또는 `"dark"`.
- 사용자 요청에 `dark`·다크·어둡게·검은 배경이 있으면 `"dark"`를 쓰고, `light`·라이트가 있거나 아무 말이 없으면 생략한다(라이트).
  예: `/mr-video:mr-video dark`, `$mr-video dark`, "MR에 설명 영상 넣어줘, 다크 모드로".
- 터미널 장면은 어느 테마에서도 어두운 창으로 그린다.

### mermaid 적극 활용

- 구조·흐름·상태가 바뀐 MR이면 **mermaid 장면을 최소 하나** 넣는다. 본문에 다이어그램이 없으면 코드에서 직접 그린다:
  호출·메시지 순서는 `sequenceDiagram`, 상태 전이는 `stateDiagram-v2`, 모듈·클래스 관계는 `classDiagram`,
  데이터 경로·구성은 `flowchart`, 테이블 구조는 `erDiagram`.
- 일직선이 아닌 흐름(분기·합류·서브그래프)은 `flow` 대신 `mermaid` flowchart로 그린다.
- 직접 그린 다이어그램의 노드·화살표는 **모두 실제 코드에 있는 모듈·함수·테이블·메시지**여야 한다.
  지어낸 구성 요소를 넣지 않는다. 본문에서 가져온 것이 아니면 장면 제목이나 첫 자막에 "코드 기준"이라고 밝힌다.
- 수정 전/후가 있는 구조는 `subgraph`(예: `예전`, `바뀐 뒤`)로 나란히 그리고, 자막마다 `emphasis`로 지금 설명하는 쪽을 강조한다.

### Unreal 에셋(`.uasset`·`.umap`) 변경

`git diff --name-only base head`에 `.uasset`이나 `.umap`이 있으면 다음 순서로 판단한다. 바이너리라 git diff로는 내용을 볼 수 없다.

1. **VibeUE 도구를 쓸 수 있고 Unreal 에디터가 켜져 있으면** 변경된 블루프린트·위젯을 읽는다
   (위젯은 `get_widget_snapshot`, 참조 관계는 `get_asset_dependencies`·`get_asset_referencers` 등 VibeUE 도구).
2. **변경 전과 현재를 비교하는 것을 기본으로 한다(웬만하면 항상).**
   - 현재(head) 상태는 에디터에 열린 에셋에서 읽는다.
   - 변경 전(base) 상태는 `git show <base>:<경로> > <임시 폴더>/<파일>`로 **프로젝트 밖 임시 폴더**에 꺼낸 뒤,
     VibeUE·에디터가 그 파일을 비교용으로 읽을 수 있는 방법(에디터의 diff·Python API 등)이 있으면 그것으로 읽는다.
   - 두 상태의 차이(추가·삭제·변경된 위젯, 노드, 바인딩, 변수, 참조)를 mermaid로 그린다.
     예전·바뀐 뒤를 `subgraph`로 나란히 두고, 바뀐 노드는 `emphasis`의 `accent`, 사라진 노드는 `bad`로 강조한다.
3. **안전 규칙:** 프로젝트 `Content/` 아래에 파일을 만들거나 덮어쓰지 않는다. 에셋을 저장·컴파일·수정하지 않는다.
   사용자의 작업 트리에서 `git checkout`·`git stash`를 하지 않는다. 임시 파일은 끝나면 지운다.
4. **비교할 수 없으면**(base를 읽을 방법이 없음) 현재 상태만 그리고, 자막에 "에디터에서 읽은 현재 상태이며 변경 전과의 비교는 아님"이라고 밝힌다.
5. **VibeUE를 쓸 수 없거나 에디터가 꺼져 있으면** 변경된 에셋 경로만 목록으로 보여 주고(`checklist`나 `table`),
   "에셋 내용은 확인하지 못함"이라고 밝힌다. 내용을 추측해서 그리지 않는다.

## 예시 plan

```json
{
  "mr": {"project": "game/server", "iid": 1234, "branch": "feature/stack-fix",
         "base": "<40자리 SHA>", "head": "<40자리 SHA>"},
  "title": "아이템 스택 병합 시 수량 유실 수정",
  "lang": "cpp",
  "scenes": [
    {"type": "title", "title": "스택 병합 시 수량이 사라지는 문제",
     "captions": ["병합할 때 최대 스택을 넘는 수량이 사라지던 문제를 고칩니다."]},
    {"type": "flow", "title": "기존 동작 경로",
     "nodes": ["ItemPickup", "Inventory::MergeStack", "min(a+b, max)", "초과분 → (없음)"], "broken": [3],
     "captions": ["아이템을 주우면 MergeStack이 호출됩니다.", "잘린 초과분을 처리하는 경로가 없었습니다."]},
    {"type": "code", "title": "변경점: 초과분 반환", "file": "src/Inventory.cpp",
     "before": "    dst.count = std::min(dst.count + src.count, dst.maxStack);\n    return 0;",
     "after": "    const int total = dst.count + src.count;\n    dst.count = std::min(total, dst.maxStack);\n    return total - dst.count;",
     "highlight": "return total - dst.count;",
     "captions": ["변경 전에는 항상 0을 반환합니다.", "합계를 먼저 계산합니다.", "넘친 수량을 반환합니다."]},
    {"type": "tests", "title": "검증한 것 / 안 한 것",
     "ran": [{"name": "MergeStack_Overflow_ReturnsRemainder", "result": "pass"}],
     "notRun": ["서버 Inventory 복제 경로"],
     "captions": ["단위 테스트 하나를 이 커밋에서 실행했습니다.", "서버 복제 경로는 실행하지 않았습니다."]},
    {"type": "checklist", "title": "리뷰 포인트",
     "items": ["MergeStack 호출자의 반환값 처리", "음수 count 입력 시 동작"],
     "captions": ["호출자들이 반환값을 쓰는지 봐 주세요.", "음수 입력도 확인 부탁드립니다."]}
  ]
}
```
