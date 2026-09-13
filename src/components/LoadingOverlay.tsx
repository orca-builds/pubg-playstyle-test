"use client";
import { useEffect, useRef } from "react";
import { loadingTiming } from "@/lib/loadingTiming";

// Register processing state; the persistent layout owns the unchanged visual.
export default function LoadingOverlay({ open, title, description, failed = false }: {
  open: boolean;
  title: string;
  description: string;
  failed?: boolean;
}) {
  const id = useRef(Symbol("loading"));
  useEffect(() => {
    const source = id.current;
    if (failed) loadingTiming.end(source, true);
    else if (open) loadingTiming.begin(source, { title, description });
    else loadingTiming.end(source);
    return () => loadingTiming.end(source);
  }, [open, failed, title, description]);
  return null;
}
