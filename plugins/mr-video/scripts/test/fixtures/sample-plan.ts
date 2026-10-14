export const CPP_BEFORE = `int Inventory::MergeStack(Slot& dst, const Slot& src)
{
    // 합계를 최대 스택으로 자른다
    dst.count = std::min(dst.count + src.count, dst.maxStack);
    return 0;
}`;

export const CPP_AFTER = `int Inventory::MergeStack(Slot& dst, const Slot& src)
{
    const int total = dst.count + src.count;
    dst.count = std::min(total, dst.maxStack);
    // 초과분은 호출자에게 돌려준다
    return total - dst.count;
}`;

export function samplePlan() {
  return {
    mr: {
      project: 'game/server',
      iid: 1234,
      branch: 'feature/inventory-stack-fix',
      base: '1111111111111111111111111111111111111111',
      head: 'abc1234def5678abc1234def5678abc1234def56',
    },
    title: '아이템 스택 병합 시 수량 유실 수정',
    lang: 'cpp' as const,
    scenes: [
      {
        type: 'title' as const,
        title: '아이템 스택 병합 시 수량이 사라지는 문제',
        captions: ['이 MR은 병합할 때 최대 스택을 넘는 수량이 사라지던 문제를 고칩니다.'],
      },
      {
        type: 'flow' as const,
        title: '기존 동작 경로',
        nodes: ['ItemPickup', 'Inventory::MergeStack', 'min(a+b, max)', '초과분 → (없음)'],
        broken: [3],
        captions: ['아이템을 주우면 MergeStack이 호출됩니다.', '잘린 초과분을 처리하는 경로가 없었습니다.'],
      },
      {
        type: 'code' as const,
        title: '변경점: 초과분을 반환',
        file: 'src/Inventory.cpp',
        before: CPP_BEFORE,
        after: CPP_AFTER,
        highlight: 'return total - dst.count;',
        captions: ['변경 전에는 항상 0을 반환합니다.', '이제 최대 스택을 넘은 수량을 반환합니다.', '호출자가 나머지를 빈 슬롯에 넣습니다.'],
      },
      {
        type: 'tests' as const,
        title: '검증한 것 / 검증 안 한 것',
        ran: [{name: 'MergeStack_Overflow_ReturnsRemainder', result: 'pass' as const}],
        notRun: ['서버 Inventory 복제 경로'],
        captions: ['단위 테스트 하나를 이 커밋에서 실행했습니다.', '서버 복제 경로는 실행하지 않았습니다.'],
      },
      {
        type: 'checklist' as const,
        title: '리뷰 포인트',
        items: ['MergeStack 호출자 3곳의 반환값 처리', '음수 count 입력 시 동작'],
        captions: ['호출자들이 반환값을 처리하는지 봐 주세요.', '음수 입력도 확인 부탁드립니다.'],
      },
    ],
  };
}
