import * as React from "react";
import { cn } from "@/utils/cn";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  isPdfMode?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, isPdfMode, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          isPdfMode
            ? "bg-transparent p-0 border-none shadow-none mb-4 break-inside-avoid"
            : "bg-white p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl shadow-sm border border-gray-100 dark:bg-slate-900 dark:border-slate-800 dark:shadow-none print:p-0 print:border-none print:shadow-none print:break-inside-avoid print:mb-6 print:bg-transparent",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

export { Card };
