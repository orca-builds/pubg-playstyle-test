export function resultImageFilename(name: string): string {
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().replace(/[. ]+$/g, "").slice(0, 80);
  return `pubg-playstyle-${safe || "result"}.png`;
}

export function canShareResultImage(file: File): boolean {
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  try { return mobile && typeof navigator.share === "function" && Boolean(navigator.canShare?.({ files: [file] })); }
  catch { return false; }
}

export function downloadResultImage(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Allow Safari to consume the URL before releasing the PNG memory.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
