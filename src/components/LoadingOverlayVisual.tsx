"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

type LoadingOverlayProps = {
  open: boolean;
  title: string;
  description: string;
};

export default function LoadingOverlayVisual({ open, title, description }: LoadingOverlayProps) {
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const root = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousRootOverflow = root.style.overflow;
    const previousFocus = document.activeElement;
    body.style.overflow = "hidden";
    root.style.overflow = "hidden";
    overlay.current?.focus({ preventScroll: true });
    const preventTouch = (event: TouchEvent) => event.preventDefault();
    document.addEventListener("touchmove", preventTouch, { passive: false });
    return () => {
      body.style.overflow = previousBodyOverflow;
      root.style.overflow = previousRootOverflow;
      document.removeEventListener("touchmove", preventTouch);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div ref={overlay} role="status" aria-live="polite" aria-atomic="true" aria-busy="true"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (["Tab", " ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) event.preventDefault();
      }}
      className="fixed inset-0 z-[1000] flex touch-none flex-col items-center justify-center gap-5 overscroll-none bg-black/80 p-6 text-center text-white outline-none">
      <h2 className="sr-only">{title}</h2>
      <Image src="/images/loading/loading-repair.png" alt="" width={1212} height={1297}
        loading="eager" sizes="(max-width: 640px) 75vw, 320px"
        className="h-auto max-h-[55dvh] w-[75vw] max-w-80 shrink-0 object-contain" />
      <p className="max-w-xs break-keep text-base font-medium leading-relaxed">{description}</p>
      <div aria-hidden="true" className="h-1 w-48 max-w-full overflow-hidden rounded-full bg-white/20">
        <div className="loading-bar-segment h-full w-1/3 rounded-full bg-amber-300" />
      </div>
    </div>
  );
}
