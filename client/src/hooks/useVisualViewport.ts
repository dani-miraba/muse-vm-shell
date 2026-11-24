import { useEffect, useState } from "react";

export interface VisualViewportState {
  height: number;
  width: number;
  offsetTop: number;
  offsetLeft: number;
  isKeyboardOpen: boolean;
}

function readViewport(baselineHeight: number): VisualViewportState {
  const vv = window.visualViewport;
  if (!vv) {
    return {
      height: window.innerHeight,
      width: window.innerWidth,
      offsetTop: 0,
      offsetLeft: 0,
      isKeyboardOpen: false,
    };
  }

  const isKeyboardOpen = vv.height < baselineHeight * 0.82;

  return {
    height: Math.round(vv.height),
    width: Math.round(vv.width),
    offsetTop: Math.round(vv.offsetTop),
    offsetLeft: Math.round(vv.offsetLeft),
    isKeyboardOpen,
  };
}

export function useVisualViewport(): VisualViewportState {
  const [baselineHeight, setBaselineHeight] = useState<number>(() =>
    typeof window !== "undefined"
      ? Math.max(window.innerHeight, window.visualViewport?.height ?? 0)
      : 800,
  );

  const [state, setState] = useState<VisualViewportState>(() =>
    typeof window !== "undefined"
      ? readViewport(window.innerHeight)
      : { height: 800, width: 400, offsetTop: 0, offsetLeft: 0, isKeyboardOpen: false },
  );

  useEffect(() => {
    let rafId = 0;

    const update = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (window.scrollY !== 0 || window.scrollX !== 0) {
          window.scrollTo(0, 0);
        }
        const currentMax = Math.max(
          window.innerHeight,
          window.visualViewport?.height ?? 0,
        );
        setBaselineHeight((prev) => {
          const nextBase =
            window.visualViewport &&
            window.visualViewport.height >= currentMax * 0.92
              ? currentMax
              : prev;
          setState(readViewport(nextBase));
          return nextBase;
        });
      });
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      cancelAnimationFrame(rafId);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [baselineHeight]);

  return state;
}
