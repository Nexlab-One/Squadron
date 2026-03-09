import { cn } from "../lib/utils";

interface SquadronLogoIconProps {
  className?: string;
  "aria-hidden"?: boolean;
}

/**
 * Squadron app logo (squadron.png).
 * Use in the company rail, headers, or anywhere the product is identified.
 */
export function SquadronLogoIcon({ className, "aria-hidden": ariaHidden = true }: SquadronLogoIconProps) {
  return (
    <img
      src="/squadron.png"
      alt="Squadron"
      className={cn("h-5 w-5 shrink-0 dark:invert", className)}
      aria-hidden={ariaHidden}
    />
  );
}
