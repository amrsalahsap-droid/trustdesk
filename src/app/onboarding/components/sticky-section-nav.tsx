"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/ui/app-design-system/primitives";

export const ONBOARDING_SECTIONS = [
  { id: "section-summary", label: "Summary" },
  { id: "section-profile", label: "Profile" },
  { id: "section-capabilities", label: "Capabilities" },
  { id: "section-workflows", label: "Workflows" },
  { id: "section-questions", label: "Questions" },
  { id: "section-risks", label: "Risks" },
  { id: "section-actions", label: "Actions" },
  { id: "intelligence-explorer", label: "Explorer" },
];

export function StickySectionNav() {
  const [activeId, setActiveId] = useState(ONBOARDING_SECTIONS[0].id);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Check if we are scrolled past the very top
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Intersection Observer to track active section
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the most intersecting entry
        const visibleEntries = entries.filter(e => e.isIntersecting);
        if (visibleEntries.length > 0) {
          // Sort by intersection ratio or just take the first one
          // We take the one closest to the top of the viewport
          const topEntry = visibleEntries.reduce((prev, curr) => {
            return (prev.boundingClientRect.top < curr.boundingClientRect.top) ? prev : curr;
          });
          setActiveId(topEntry.target.id);
        }
      },
      { 
        rootMargin: "-150px 0px -60% 0px", // Trigger active state when element hits top offset
        threshold: 0 
      }
    );

    ONBOARDING_SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      // TopContextBar is likely sticky. Sticky nav is also sticky.
      // Total offset: TopContextBar (approx 72px) + StickySectionNav (approx 56px) + padding = ~160px
      const y = el.getBoundingClientRect().top + window.scrollY - 160;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div 
      className={cn(
        "sticky top-[64px] lg:top-[72px] z-40 w-full transition-all duration-300",
        isScrolled 
          ? "bg-surface-base/80 backdrop-blur-md border-b border-surface-border/50 shadow-sm py-2" 
          : "bg-transparent py-4"
      )}
    >
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          {ONBOARDING_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => handleClick(s.id)}
              className={cn(
                "text-[10px] lg:text-xs font-bold uppercase tracking-widest whitespace-nowrap px-4 py-2 rounded-full transition-all duration-300",
                activeId === s.id 
                  ? "bg-intelligence-blue text-white shadow-premium-sm" 
                  : "text-text-muted hover:text-text-primary hover:bg-surface-muted"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden block w-full">
          <select
            value={activeId}
            onChange={(e) => handleClick(e.target.value)}
            className="w-full bg-surface-base border border-surface-border/50 text-text-primary text-sm font-bold rounded-lg px-4 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-intelligence-blue/50"
          >
            {ONBOARDING_SECTIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
