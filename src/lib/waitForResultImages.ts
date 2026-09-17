// Includes both the character and the brand image in the export-only card.
export async function waitForResultImages(card: HTMLElement, timeoutMs = 10_000): Promise<void> {
  const images = Array.from(card.querySelectorAll("img"));
  if (images.length === 0) throw new Error("IMAGE_MISSING");

  const cleanups: (() => void)[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all(images.map(image => new Promise<void>((resolve, reject) => {
        const loaded = () => {
          if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            reject(new Error("IMAGE_LOAD_FAILED"));
            return;
          }
          // Decode before capture as well, so mobile browsers have pixels ready.
          if (typeof image.decode === "function") image.decode().then(resolve, reject);
          else resolve();
        };
        const failed = () => reject(new Error("IMAGE_LOAD_FAILED"));
        image.addEventListener("load", loaded, { once: true });
        image.addEventListener("error", failed, { once: true });
        cleanups.push(() => {
          image.removeEventListener("load", loaded);
          image.removeEventListener("error", failed);
        });
        if (image.complete) loaded();
      }))),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("IMAGE_LOAD_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    cleanups.forEach(cleanup => cleanup());
  }
}
