import * as React from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isPdfMode?: boolean;
}

export const PDF_INPUT_CLASS =
  "w-full min-h-[2.75rem] py-2 text-base leading-8 text-black bg-transparent border-0 border-b border-gray-300 font-medium overflow-visible";

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, isPdfMode, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          isPdfMode
            ? PDF_INPUT_CLASS
            : "w-full px-3 py-2.5 sm:p-4 text-sm sm:text-lg border-2 border-gray-200 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-colors text-gray-900 bg-white min-h-[2.5rem] sm:min-h-[3.5rem] placeholder:text-gray-400 shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400 dark:focus:ring-blue-500/20 print:shadow-none print:border-gray-300 print:text-base print:p-2 print:min-h-0 print:bg-transparent print:text-black",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
