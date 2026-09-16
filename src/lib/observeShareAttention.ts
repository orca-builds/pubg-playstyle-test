const VISIBILITY_THRESHOLD = 0.7;

// React 19 callback ref: 버튼이 연결되면 관찰하고, 해제되면 반환한 cleanup을 실행합니다.
export function observeShareAttention(button: HTMLButtonElement | null) {
  if (!button || button.dataset.shareAttention === "started" ||
      typeof window.IntersectionObserver !== "function" ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  let stopped = false;
  const observer = new window.IntersectionObserver((entries) => {
    if (stopped || !entries.some(entry => entry.target === button &&
        entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD)) return;

    // 속성은 지우지 않습니다. 스크롤·리렌더·Strict Mode ref 재연결에도 재실행하지 않습니다.
    button.dataset.shareAttention = "started";
    stopped = true;
    observer.disconnect();
  }, { threshold: VISIBILITY_THRESHOLD });

  observer.observe(button);
  return () => {
    stopped = true;
    observer.disconnect();
  };
}
