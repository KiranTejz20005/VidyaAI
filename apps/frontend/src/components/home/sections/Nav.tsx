"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/home/Button";
import { Logo } from "@/components/home/Logo";
import { EASE } from "@/components/home/motion";
import { cn, isInternalHref, nav, site } from "@/lib/site";

function NavLink({
  href,
  children,
  className,
  onClick,
  onMouseEnter,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
}) {
  if (isInternalHref(href)) {
    return (
      <Link href={href} className={className} onClick={onClick} onMouseEnter={onMouseEnter}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} onClick={onClick} onMouseEnter={onMouseEnter}>
      {children}
    </a>
  );
}

export function Nav() {
  const { scrollY, scrollYProgress } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 24));

  return (
    <>
      {/* Reading progress */}
      <motion.div
        aria-hidden
        style={{ scaleX: scrollYProgress }}
        className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-linear-to-r from-brand via-brand-soft to-sun"
      />

      <motion.header
        initial={{ opacity: 0, transform: "translateY(-14px)" }}
        animate={{ opacity: 1, transform: "translateY(0px)" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5"
      >
        <nav
          aria-label="Primary"
          className={cn(
            "relative mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full border pl-4 pr-2",
            "transition-[background-color,border-color,box-shadow] duration-300 ease-out",
            scrolled || open
              ? "border-black/[0.06] bg-white/75 shadow-[0_10px_40px_-18px_rgb(16_17_20/0.3)] backdrop-blur-xl"
              : "border-transparent bg-transparent",
          )}
        >
          <a href="#top" aria-label={`${site.name} home`} className="rounded-full">
            <Logo />
          </a>

          <ul
            className="absolute left-1/2 hidden -translate-x-1/2 items-center md:flex"
            onMouseLeave={() => setHovered(null)}
          >
            {nav.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  onMouseEnter={() => setHovered(item.href)}
                  className="relative block rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors duration-150 hover:text-ink"
                >
                  {hovered === item.href && (
                    <motion.span
                      layoutId="nav-hover"
                      className="absolute inset-0 rounded-full bg-black/[0.055]"
                      transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                    />
                  )}
                  <span className="relative">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-1.5">
            <Link
              href={site.links.signIn}
              className="hidden rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors duration-150 hover:text-ink sm:block"
            >
              Sign in
            </Link>
            <Link
              href={site.links.contact}
              className="hidden rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors duration-150 hover:text-ink lg:block"
            >
              Contact
            </Link>
            <Button href={site.links.getStarted} size="sm" arrow className="hidden sm:inline-flex">
              Get started
            </Button>
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="grid size-10 place-items-center rounded-full bg-ink text-white transition-transform duration-150 ease-out-strong active:scale-[0.94] md:hidden"
            >
              {open ? <X className="size-4.5" /> : <Menu className="size-4.5" />}
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, transform: "translateY(-8px) scale(0.97)" }}
              animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
              exit={{ opacity: 0, transform: "translateY(-8px) scale(0.97)" }}
              transition={{ duration: 0.22, ease: EASE }}
              style={{ transformOrigin: "top right" }}
              className="mx-auto mt-2 max-w-6xl rounded-3xl border border-black/[0.06] bg-white/95 p-3 shadow-float backdrop-blur-xl md:hidden"
            >
              <ul>
                {nav.map((item, i) => (
                  <motion.li
                    key={item.href}
                    initial={{ opacity: 0, transform: "translateY(8px)" }}
                    animate={{ opacity: 1, transform: "translateY(0px)" }}
                    transition={{ duration: 0.3, delay: 0.04 * i, ease: EASE }}
                  >
                    <NavLink
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-2xl px-4 py-3 text-[17px] font-medium tracking-[-0.02em] text-ink active:bg-black/5"
                    >
                      {item.label}
                    </NavLink>
                  </motion.li>
                ))}
              </ul>
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-3">
                <Button href={site.links.signIn} variant="secondary">
                  Sign in
                </Button>
                <Button href={site.links.contact} variant="secondary">
                  Contact
                </Button>
                <Button href={site.links.getStarted} arrow className="col-span-2">
                  Get started
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>
    </>
  );
}
