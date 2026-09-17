export async function imageUrlToDataURL(url: string, timeoutMs = 10_000): Promise<string> {
  const controller = new AbortController();
  let reader: FileReader | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("IMAGE_FETCH_FAILED");
        const blob = await response.blob();
        if (controller.signal.aborted) throw new Error("IMAGE_INLINE_TIMEOUT");
        if (!blob.size || !blob.type.startsWith("image/")) throw new Error("IMAGE_CONTENT_INVALID");
        return await new Promise<string>((resolve, reject) => {
          reader = new FileReader();
          reader.onload = () => {
            const data = reader?.result;
            if (typeof data !== "string" || !/^data:image\/[^;,]+;base64,.+/.test(data)) {
              reject(new Error("IMAGE_DATA_URL_FAILED"));
            } else resolve(data);
          };
          reader.onerror = () => reject(new Error("IMAGE_DATA_URL_FAILED"));
          reader.onabort = () => reject(new Error("IMAGE_DATA_URL_ABORTED"));
          reader.readAsDataURL(blob);
        });
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("IMAGE_INLINE_TIMEOUT"));
          controller.abort();
          reader?.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (reader) reader.onload = reader.onerror = reader.onabort = null;
  }
}

export async function inlineResultImages(card: HTMLElement): Promise<void> {
  const images = Array.from(card.querySelectorAll("img"));
  if (!images.length) throw new Error("IMAGE_MISSING");
  // Fetch every resource before modifying the export DOM; never capture a partial card.
  const sources = await Promise.all(images.map(image => imageUrlToDataURL(image.src)));
  images.forEach((image, index) => {
    image.removeAttribute("srcset");
    image.src = sources[index];
  });
}

export function waitForResultImagePaint(): Promise<void> {
  return new Promise((resolve, reject) => {
    let frame: number;
    const timer = setTimeout(() => {
      cancelAnimationFrame(frame);
      reject(new Error("IMAGE_PAINT_TIMEOUT"));
    }, 10_000);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  });
}
