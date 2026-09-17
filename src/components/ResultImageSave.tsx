"use client";

import { useEffect, useRef, useState } from "react";
import type { ScoringResult } from "@/lib/scoring";
import { trackEvent } from "@/lib/analytics";
import { downloadResultImage, isIOSBrowser, resultImageFilename } from "@/lib/resultImageFile";

type Props = { result: ScoringResult; attemptId: string; disabled?: boolean };

export default function ResultImageSave(props: Props) {
  // A new result/attempt disposes the old URL and invalidates pending generation.
  return <ResultImageSaveButton key={`${props.attemptId}:${props.result.testVersion}:${props.result.mainResult.id}`} {...props} />;
}

function ResultImageSaveButton({ result, attemptId, disabled = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ios, setIOS] = useState(false);
  const prepared = useRef<string | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const preview = useRef<HTMLImageElement | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (prepared.current) URL.revokeObjectURL(prepared.current);
      prepared.current = null;
    };
  }, []);

  useEffect(() => {
    if (!imageUrl) return;
    const view = dialog.current;
    const image = preview.current;
    const properties = { attempt_id: attemptId, test_version: result.testVersion, main_type: result.mainResult.id };
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function finish(success: boolean) {
      if (settled || !mounted.current || prepared.current !== imageUrl) return;
      settled = true;
      clearTimeout(timer);
      // iOS success means a visible, loaded image is available for saving.
      // The browser cannot confirm whether the user saved it to Photos.
      trackEvent(success ? "result_image_save_success" : "result_image_save_error", properties);
      if (!success) {
        if (prepared.current) URL.revokeObjectURL(prepared.current);
        prepared.current = null;
        setImageUrl(null);
        setFailed(true);
      }
    }
    const loaded = () => finish(Boolean(view?.open && image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0));
    const failed = () => finish(false);
    try {
      if (!view || !image) throw new Error("IMAGE_VIEW_MISSING");
      view.showModal();
      image.addEventListener("load", loaded);
      image.addEventListener("error", failed);
      timer = setTimeout(failed, 10_000);
      if (image.complete) loaded();
    } catch { failed(); }
    return () => {
      clearTimeout(timer);
      image?.removeEventListener("load", loaded);
      image?.removeEventListener("error", failed);
      view?.close();
    };
  }, [imageUrl, attemptId, result.testVersion, result.mainResult.id]);

  function closeImageView() {
    if (prepared.current) URL.revokeObjectURL(prepared.current);
    prepared.current = null;
    setImageUrl(null);
  }

  async function handleSave() {
    if (lock.current || disabled || prepared.current || !mounted.current) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    const properties = { attempt_id: attemptId, test_version: result.testVersion, main_type: result.mainResult.id };
    const needsImageView = isIOSBrowser();
    setIOS(needsImageView);
    trackEvent("result_image_save_click", properties);
    try {
      const { createResultImage } = await import("@/lib/createResultImage");
      const blob = await createResultImage(result);
      if (!mounted.current) return;
      const filename = resultImageFilename(result.mainResult.name);
      if (needsImageView) {
        const url = URL.createObjectURL(blob);
        prepared.current = url;
        setImageUrl(url);
        return;
      }
      downloadResultImage(blob, filename);
      // Success confirms server PNG + browser handoff, not a completed Files/Photos save.
      trackEvent("result_image_save_success", properties);
    } catch {
      if (!mounted.current) return;
      if (prepared.current) URL.revokeObjectURL(prepared.current);
      prepared.current = null;
      setImageUrl(null);
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
      {busy ? (ios ? "이미지 만드는 중..." : "이미지 저장 중...") : "이미지 저장"}
    </button>
    {failed && <p role="alert" className="text-center text-sm leading-6 text-slate-600">이미지 저장에 실패했어요. 다시 시도해주세요.</p>}
    {imageUrl && <dialog ref={dialog} aria-label="결과 이미지 저장" onCancel={closeImageView} onClose={closeImageView}
      className="fixed inset-0 m-auto max-h-[100dvh] w-full max-w-xl overflow-y-auto bg-white p-4 backdrop:bg-black/70">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-700">이미지를 길게 눌러 저장하세요.</p>
        <button type="button" onClick={closeImageView} className="min-h-11 px-4 text-sm font-semibold">닫기</button>
      </div>
      {/* Display the original PNG; CSS only fits its preview to the screen. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={preview} src={imageUrl} alt={`${result.mainResult.name} 결과 이미지`} width={1080} height={1350}
        className="block h-auto w-full" style={{ WebkitTouchCallout: "default" }} />
    </dialog>}
  </div>;
}
