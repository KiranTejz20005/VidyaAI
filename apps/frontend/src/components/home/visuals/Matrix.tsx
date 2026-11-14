"use client";

import { motion } from "framer-motion";
import { EASE } from "@/components/home/motion";
import { cn } from "@/lib/site";

/** Illustrative CO–PO correlation weights (0 = no mapping, 1 Low, 2 Medium, 3 High). */
export const MATRIX = [
  [3, 2, 0, 1, 0, 2],
  [2, 3, 1, 0, 0, 1],
  [1, 2, 3, 2, 0, 0],
  [0, 1, 2, 3, 1, 0],
  [2, 0, 1, 2, 3, 1],
  [1, 0, 0, 2, 2, 3],
];

const tone = [
  "bg-black/[0.035] text-black/25",
  "bg-brand/15 text-brand",
  "bg-brand/50 text-white",
  "bg-brand text-white",
];

export function Matrix({
  size = "sm",
  highlight,
}: {
  size?: "sm" | "lg";
  /** [row, col] of a cell shown as being manually overridden. */
  highlight?: [number, number];
}) {
  const lg = size === "lg";
  return (
    <div
      className={cn(
        "grid grid-cols-[auto_repeat(6,minmax(0,1fr))] items-center",
        lg ? "gap-1.5 text-xs" : "gap-1 text-[10px]",
      )}
    >
      <span />
      {MATRIX[0].map((_, c) => (
        <span key={c} className="pb-0.5 text-center font-mono font-medium text-mute">
          PO{c + 1}
        </span>
      ))}
      {MATRIX.map((row, r) => (
        <div key={r} className="contents">
          <span className={cn("font-mono font-medium text-mute", lg ? "pr-2" : "pr-1.5")}>
            CO{r + 1}
          </span>
          {row.map((v, c) => {
            const isHi = highlight && highlight[0] === r && highlight[1] === c;
            return (
              <motion.div
                key={c}
                initial={{ opacity: 0, transform: "scale(0.82)" }}
                whileInView={{ opacity: 1, transform: "scale(1)" }}
                viewport={{ once: true, margin: "0px 0px -8% 0px" }}
                transition={{ duration: 0.45, delay: 0.25 + (r * 6 + c) * 0.022, ease: EASE }}
                className={cn(
                  "relative grid place-items-center rounded-md font-mono font-semibold",
                  lg ? "h-10 rounded-lg text-sm" : "h-6",
                  tone[v],
                  isHi && "ring-2 ring-sun ring-offset-2 ring-offset-white",
                )}
              >
                {v === 0 ? "–" : v}
              </motion.div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
