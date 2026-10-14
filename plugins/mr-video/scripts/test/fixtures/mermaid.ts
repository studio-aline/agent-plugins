// Diagrams shaped like the ones in real MR descriptions: subgraphs, <br/> labels, Korean text.
export const FLOW_BEFORE_AFTER = `flowchart LR
  subgraph B["예전"]
    W1["world"] -- "W2NHeartbeat 60초" --> C[("nexus ccu")]
    W1 -- "60초" --> LC[("game_log log_ccu")]
  end
  subgraph A["바뀐 뒤"]
    W2["world"] -- "S2NServerReport 5초" --> NX["nexus"]
    NX --> SR[("server_report<br/>world 행 ccu")]
  end`;

export const SEQUENCE_TALL = `sequenceDiagram
  participant S as login·world·하이브
  participant P as NexusServerReportProc
  participant NX as nexus DB
  participant F as 팔콘 DB
  S->>P: S2NServerReport (5초, 서버마다 각자)
  Note over P: 최신 리포트 덮어씀<br/>카운터는 받을 때 한 번씩만 쌓음
  loop 5초 틱
    P->>P: nexus 자신의 리포트 추가
    P->>NX: 새로 받은 리포트 → server_report 덮어쓰기
    opt 팔콘 켜짐
      P->>P: 게이지 샘플링 + 카운터 → 1분 누적
    end
  end
  opt 팔콘 켜짐 · 분이 바뀌면
    P->>F: 직전 1분 → f_server_metric
  end
  Note over P: 매시 정각
  P->>NX: 7일 넘게 보고 없는 행 삭제`;
