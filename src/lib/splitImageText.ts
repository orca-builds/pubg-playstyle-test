// Two explicit lines avoid Satori's automatic Korean character-level wrapping.
// Never split a word, even if a single word exceeds the preferred line length.
export function splitImageText(text: string, maxCharsPerLine: number): string {
  const words = text.trim().split(/\s+/);
  const normalized = words.join(" ");
  if (normalized.length <= maxCharsPerLine || words.length < 2) return normalized;
  let split = 1;
  let difference = Infinity;
  for (let index = 1; index < words.length; index++) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const distance = Math.abs(left.length - right.length);
    if (distance < difference) {
      difference = distance;
      split = index;
    }
  }
  return `${words.slice(0, split).join(" ")}\n${words.slice(split).join(" ")}`;
}
