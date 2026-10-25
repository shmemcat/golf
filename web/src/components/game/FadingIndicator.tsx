import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export function FadingIndicator({ active, className, children }: {
  active: boolean;
  className: string;
  children?: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  return (
    <AnimatePresence>
      {active && (
        <motion.span
          key="indicator"
          className={className}
          aria-hidden={children ? undefined : true}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.16, ease: "easeInOut" }}
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
