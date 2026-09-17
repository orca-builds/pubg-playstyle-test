"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoringResult } from "@/lib/scoring";
import { trackEvent } from "@/lib/analytics";
import { downloadResultImage, resultImageFilename } from "@/lib/resultImageFile";

export default function ResultImageSave({ result, attemptId, disabled = false }: { result: ScoringResult; attemptId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function handleSave() {
    if (lock.current || disabled) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    const properties = { attempt_id: attemptId, test_version: result.testVersion, main_type: result.mainResult.id };
    trackEvent("result_image_save_click", properties);
    try {
      const { createResultImage } = await import("@/lib/createResultImage");
      const blob = await createResultImage(result);
      if (!mounted.current) return;
      downloadResultImage(blob, resultImageFilename(result.mainResult.name));
      trackEvent("result_image_save_success", properties);
    } catch {
      trackEvent("result_image_save_error", properties);
      if (mounted.current) setFailed(true);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return <div className="space-y-2">
    <button type="button" disabled={disabled || busy} aria-busy={busy} onClick={handleSave}
      className="min-h-11 w-full rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
      {busy ? "이미지 저장 중..." : "이미지 저장"}
    </button>
    {failed && <p role="alert" className="text-center text-sm leading-6 text-slate-600">이미지 저장에 실패했어요. 다시 시도해주세요.</p>}
  </div>;
}
