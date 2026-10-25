import type { CSSProperties, ReactElement, ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

type TooltipProps = {
  content: ReactNode;
  children: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const tooltipStyle: CSSProperties = {
  backgroundColor: "var(--tooltipbackground)",
  color: "var(--tooltiptext)",
  fontWeight: 700,
  fontSize: "0.875rem",
  letterSpacing: "1.5px",
  borderRadius: "6px",
  padding: "6px 12px",
  maxWidth: "min(280px, calc(100vw - 24px))",
  zIndex: 9999,
};

export function Tooltip({ content, children, open, onOpenChange }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content side="top" sideOffset={6} collisionPadding={12} style={tooltipStyle}>
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
