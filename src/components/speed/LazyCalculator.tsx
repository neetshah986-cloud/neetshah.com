"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const ScoreCalculator = dynamic(() => import("./ScoreCalculator").then((m) => m.ScoreCalculator));

/** The standalone score calculator, loaded when it scrolls near the screen (or when linked to directly). */
export function LazyCalculator() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref}>{show ? <ScoreCalculator /> : <div className="h-[34rem] rounded-2xl border border-rule bg-white" aria-label="Score calculator loading" />}</div>;
}
