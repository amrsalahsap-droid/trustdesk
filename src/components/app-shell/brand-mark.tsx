"use client";

import React from "react";
import Link from "next/link";
import { LogoIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: {
    tile: "h-7 w-7 rounded-lg",
    icon: "h-4 w-4",
    word: "logo-wordmark !text-sm",
    gap: "gap-2",
  },
  md: {
    tile: "h-9 w-9 rounded-xl",
    icon: "h-5 w-5",
    word: "logo-wordmark !text-base",
    gap: "gap-3",
  },
  lg: {
    tile: "h-11 w-11 rounded-xl",
    icon: "h-6 w-6",
    word: "logo-wordmark !text-xl",
    gap: "gap-4",
  },
} as const;

export type BrandMarkSize = keyof typeof SIZE_STYLES;

export type BrandMarkProps = {
  size?: BrandMarkSize;
  showWordmark?: boolean;
  /** When set, the lockup is a link; otherwise a non-interactive group (e.g. onboarding splash). */
  href?: string | null;
  /** `dark` = light text on slate rails; `light` = default app shell. */
  theme?: "light" | "dark";
  className?: string;
};

/**
 * Shared TrustDesk logo + wordmark. Uses official LogoIcon.
 */
export function BrandMark({
  size = "md",
  showWordmark = true,
  href = "/app",
  theme = "light",
  className,
}: BrandMarkProps) {
  const s = SIZE_STYLES[size];
  const wordClass = theme === "dark" ? "text-white" : "text-text-primary";

  const tile = (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center bg-accent-primary shadow-lg shadow-accent-primary/20",
        s.tile,
      )}
    >
      <LogoIcon className={cn("text-white", s.icon)} />
    </div>
  );

  const wordmark = showWordmark ? (
    <span className={cn(s.word, wordClass)}>TrustDesk</span>
  ) : null;

  const inner = (
    <>
      {tile}
      {wordmark}
    </>
  );

  const rowClass = cn("flex items-center", s.gap, className);

  if (href == null || href === "") {
    return (
      <div className={cn(rowClass, "cursor-default select-none")} aria-label="TrustDesk">
        {inner}
      </div>
    );
  }

  return (
    <Link href={href} className={cn(rowClass, "group outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel rounded-md")}>
      {inner}
    </Link>
  );
}
