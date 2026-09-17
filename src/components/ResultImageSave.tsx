"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoringResult } from "@/lib/scoring";
import { trackEvent } from "@/lib/analytics";
import { downloadPreparedResultImage, downloadResultImage, isIOSBrowser, resultImageFilename } from "@/lib/resultImageFile";

type Props = { result: ScoringResult; attemptId: string; disabled?: boolean };
type PreparedDownload = { url: string; filename: string };

export default function ResultImageSave(props: Props) {
  // A new result/attempt disposes the old URL and invalidates pending generation.
  return <ResultImageSaveButton key={`${props.attemptId}:${props.result.testVersion}:${props.result.mainResult.id}`} {...props} />;
}

function ResultImageSaveButton({ result, attemptId, disabled = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState<PreparedDownload | null>(null);
  const [ios, setIOS] = useState(false);
  const prepared = useRef<PreparedDownload | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (prepared.current) URL.revokeObjectURL(prepared.current.url);
      prepared.current = null;
    };
  }, []);

  async function handleSave() {
    if (lock.current || disabled) return;
    // Ignore another click using a ready button that has already been consumed.
    if (ready && prepared.current !== ready) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    const properties = { attempt_id: attemptId, test_version: result.testVersion, main_type: result.mainResult.id };
    const needsSecondTap = isIOSBrowser();
    setIOS(needsSecondTap);
    if (!ready) trackEvent("result_image_save_click", properties);
    try {
      if (ready) {
        prepared.current = null;
        setReady(null);
        // No await before this call: the download runs in the second tap's stack.
        downloadPreparedResultImage(ready.url, ready.filename);
        trackEvent("result_image_save_success", properties);
        return;
      }
      const { createResultImage } = await import("@/lib/createResultImage");
      const blob = await createResultImage(result);
      if (!mounted.current) return;
      const filename = resultImageFilename(result.mainResult.name);
      if (needsSecondTap) {
        const download = { url: URL.createObjectURL(blob), filename };
        prepared.current = download;
        setReady(download);
        return;
      }
      downloadResultImage(blob, filename);
      trackEvent("result_image_save_success", properties);
    } catch {
      if (!mounted.current) return;
      if (prepared.current) URL.revokeObjectURL(prepared.current.url);
      prepared.current = null;
      setReady(null);
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
      {busy ? (ios ? "이미지 만드는 중..." : "이미지 저장 중...") : ready ? "이미지 다운로드" : "이미지 저장"}
    </button>
    {failed && <p role="alert" className="text-center text-sm leading-6 text-slate-600">이미지 저장에 실패했어요. 다시 시도해주세요.</p>}
    {ready && <p role="status" className="text-center text-sm leading-6 text-slate-600">이미지가 준비됐어요. 한 번 더 눌러 저장하세요.</p>}
  </div>;
}
