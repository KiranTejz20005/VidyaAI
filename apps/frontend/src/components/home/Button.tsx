import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn, isInternalHref } from "@/lib/site";

type Variant = "primary" | "secondary" | "light" | "ghost-dark";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-brand [@media(hover:hover)]:hover:bg-[#d24e2b]",
  secondary:
    "bg-white text-ink shadow-card ring-1 ring-black/5 [@media(hover:hover)]:hover:bg-[#f6f5f2]",
  light: "bg-white text-ink shadow-button [@media(hover:hover)]:hover:bg-brand-tint",
  "ghost-dark":
    "bg-white/8 text-white ring-1 ring-white/15 backdrop-blur [@media(hover:hover)]:hover:bg-white/14",
};

export function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  arrow = false,
  external = false,
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: "sm" | "md";
  arrow?: boolean;
  external?: boolean;
  className?: string;
}) {
  const classes = cn(
    "group/btn inline-flex select-none items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em]",
    "transition-[transform,background-color] duration-150 ease-out-strong active:scale-[0.97]",
    size === "md" ? "h-12 px-6 text-[15px]" : "h-10 px-4.5 text-sm",
    variants[variant],
    className,
  );

  const content = (
    <>
      {children}
      {arrow && (
        <ArrowRight
          aria-hidden
          className="size-4 transition-transform duration-200 ease-out-strong [@media(hover:hover)]:group-hover/btn:translate-x-0.5"
        />
      )}
    </>
  );

  if (!external && isInternalHref(href)) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={classes}
    >
      {content}
    </a>
  );
}
