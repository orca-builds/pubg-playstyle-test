// 결과 UI에서만 사용합니다. 55:45 이내는 비슷한 성향으로 표시합니다.
export function getAxisEmphasis(first: number, second: number): "first" | "second" | "balanced" {
  if (Math.abs(first - second) <= 10) return "balanced";
  return first > second ? "first" : "second";
}
