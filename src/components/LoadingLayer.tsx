"use client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import LoadingOverlayVisual from "@/components/LoadingOverlayVisual";
import { loadingTiming } from "@/lib/loadingTiming";
const serverSnapshot = () => null;
export default function LoadingLayer({ children }: { children: ReactNode }) {
  const message = useSyncExternalStore(loadingTiming.subscribe, loadingTiming.getSnapshot, serverSnapshot);
  useEffect(() => () => loadingTiming.dispose(), []);
  return (
    <>
      <LoadingOverlayVisual open={message !== null} title={message?.title ?? ""} description={message?.description ?? ""} />
      <div inert={message !== null} className="flex min-h-full flex-1 flex-col">{children}</div>
    </>
  );
}
