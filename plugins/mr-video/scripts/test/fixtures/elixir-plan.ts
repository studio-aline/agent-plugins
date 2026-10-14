export const EX_BEFORE = `defmodule Matchmaker.Retry do
  @max 3

  def run(fun, attempt \\\\ 0) do
    case fun.() do
      {:ok, v} -> {:ok, v}
      {:error, _} when attempt < @max -> run(fun, attempt + 1)
      err -> err
    end
  end
end`;

export const EX_AFTER = `defmodule Matchmaker.Retry do
  @max 3

  def run(fun, attempt \\\\ 0) do
    case fun.() do
      {:ok, v} -> {:ok, v}
      {:error, _} when attempt < @max ->
        Process.sleep(backoff(attempt))
        run(fun, attempt + 1)
      err -> err
    end
  end

  # 100ms, 200ms, 400ms
  defp backoff(n), do: 100 * Integer.pow(2, n)
end`;

export function elixirPlan() {
  return {
    mr: {project: 'game/matchmaker', branch: 'feature/retry-backoff', base: '2222222', head: 'def5678def5678'},
    title: '재시도에 지수 백오프 추가',
    lang: 'elixir' as const,
    scenes: [
      {type: 'title' as const, title: '재시도 사이에 대기 시간을 둡니다', summary: '`Matchmaker.Retry.run/2` · ${backtick} 안전성 확인', captions: ['실패하면 바로 재시도하던 것을 바꿉니다.']},
      {
        type: 'code' as const,
        title: '변경점: backoff/1',
        file: 'lib/matchmaker/retry.ex',
        before: EX_BEFORE,
        after: EX_AFTER,
        highlight: 'Process.sleep(backoff(attempt))',
        captions: ['변경 전입니다.', '재시도 전에 잠깐 기다립니다.', '대기 시간은 `backoff/1`이 계산합니다.'],
      },
      {
        type: 'checklist' as const,
        title: '리뷰 포인트',
        items: ['최대 대기 400ms가 적절한지', '테스트에서 sleep을 피하는 방법'],
        captions: ['최대 대기 시간을 봐 주세요.'],
      },
    ],
  };
}
