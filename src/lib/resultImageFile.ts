export function resultImageFilename(name: string): string {
  const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").trim().replace(/[. ]+$/g, "").slice(0, 80);
  return `pubg-playstyle-${safe || "result"}.png`;
}

export function downloadResultImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  let link: HTMLAnchorElement | undefined;
  try {
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
  } finally {
    link?.remove();
    // Allow Safari to consume the URL before releasing the PNG memory.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
