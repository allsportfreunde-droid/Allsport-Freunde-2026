"use client";

import { MotionConfig } from "framer-motion";

/**
 * Honors the visitor's "reduce motion" OS setting for every framer-motion
 * animation on the site: transforms are skipped, only opacity fades remain.
 */
export default function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
