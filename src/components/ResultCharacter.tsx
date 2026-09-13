"use client";

import Image from "next/image";
import { useState } from "react";

export default function ResultCharacter({ src, name }: { src: string | null; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const valid = typeof src === "string" && /^\/images\/results\/\d{2}_[a-z-]+\.png$/.test(src);
  return (
    <div className="mx-auto flex aspect-square w-full max-w-48 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 sm:max-w-56">
      {valid && failedSrc !== src ? (
        <Image src={src} alt={`${name} 캐릭터 이미지`} width={224} height={224}
          sizes="(min-width: 640px) 224px, 192px" className="h-full w-full object-contain"
          onError={() => setFailedSrc(src)} />
      ) : (
        <svg aria-hidden="true" viewBox="0 0 100 100" className="size-24 text-slate-300" fill="currentColor">
          <circle cx="50" cy="30" r="18" />
          <path d="M16 90v-8a34 34 0 0 1 68 0v8Z" />
        </svg>
      )}
    </div>
  );
}
