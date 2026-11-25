import { cn } from "@/lib/site";

/** The VidyaAI mascot mark, served from /public/logo.png. */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <img
      src="/logo.png"
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0 select-none object-contain", className)}
      draggable={false}
    />
  );
}

export function Logo({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark size={36} />
      <span
        className={cn(
          "font-display text-[21px] font-bold tracking-[-0.02em]",
          dark ? "text-white" : "text-ink",
        )}
      >
        Vidya<span className={dark ? "text-brand-soft" : "text-brand"}>AI</span>
      </span>
    </span>
  );
}
