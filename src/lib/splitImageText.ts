// Whole-word wrapping using pixel widths measured from the renderer's font.
export function splitImageText(text: string, maxWidth: number, measure: (text: string) => number, maxLines = 2): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const widths = new Map<string, number>();
  const width = (line: string) => {
    if (!widths.has(line)) widths.set(line, measure(line));
    return widths.get(line)!;
  };
  if (width(words.join(" ")) <= maxWidth) return [words.join(" ")];
  // Prefer fewer lines, then balanced widths; discourage isolated final words.
  for (let count = 2; count <= maxLines; count++) {
    const memo = new Map<string, { lines: string[]; cost: number } | null>();
    function fit(start: number, remaining: number): { lines: string[]; cost: number } | null {
      if (remaining === 0) return start === words.length ? { lines: [], cost: 0 } : null;
      const key = `${start}:${remaining}`;
      if (memo.has(key)) return memo.get(key)!;
      let best: { lines: string[]; cost: number } | null = null;
      for (let end = start + 1; end <= words.length - remaining + 1; end++) {
        const line = words.slice(start, end).join(" ");
        const pixels = width(line);
        if (pixels > maxWidth) break;
        const tail = fit(end, remaining - 1);
        if (!tail) continue;
        const orphan = remaining === 1 && end - start === 1 ? maxWidth ** 2 : 0;
        const cost = pixels ** 2 + tail.cost + orphan;
        if (!best || cost < best.cost) best = { lines: [line, ...tail.lines], cost };
      }
      memo.set(key, best);
      return best;
    }
    const solution = fit(0, count);
    if (solution) return solution.lines;
  }
  throw new Error("IMAGE_TEXT_OVERFLOW"); // Never truncate or split a word.
}
