import * as React from "react";
import { cn } from "@/utils/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isPdfMode?: boolean;
  scrollable?: boolean;
}

export const SCROLLABLE_TEXTAREA_CLASS =
  "max-h-[8.5rem] sm:max-h-[12rem] overflow-y-auto overscroll-contain touch-pan-y [scrollbar-gutter:stable]";

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isPdfMode, scrollable, style, ...props }, ref) => {
    const scrollStyle =
      scrollable && !isPdfMode
        ? ({ WebkitOverflowScrolling: "touch", ...style } as React.CSSProperties)
        : style;

    return (
      <textarea
        className={cn(
          isPdfMode
            ? "w-full py-1 text-base text-black bg-transparent border-0 border-b border-gray-300 font-medium leading-relaxed min-h-[4rem] resize-none overflow-hidden"
            : "w-full px-3 py-2.5 sm:p-4 text-sm sm:text-lg border-2 border-gray-200 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-colors text-gray-900 bg-white min-h-[5rem] sm:min-h-[7rem] placeholder:text-gray-400 leading-relaxed shadow-sm overflow-hidden resize-none print:shadow-none print:border-gray-300 print:text-base print:p-2 print:min-h-[5rem] print:bg-transparent",
          scrollable && !isPdfMode ? SCROLLABLE_TEXTAREA_CLASS : "",
          className
        )}
        ref={ref}
        style={scrollStyle}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
