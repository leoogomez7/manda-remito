import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type IconActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "title"> & {
  label: string;
  tone?: "neutral" | "success" | "danger";
  children: ReactNode;
};

export function IconActionButton({ label, tone = "neutral", children, className, ...props }: IconActionButtonProps) {
  const toneClasses = {
    neutral: "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
    success: "text-muted-foreground hover:bg-emerald-500/15 hover:text-emerald-400",
    danger: "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
  }[tone];

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={props.disabled ? 0 : undefined} className="inline-flex">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={label}
              className={cn(toneClasses, className)}
              {...props}
            >
              {children}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
