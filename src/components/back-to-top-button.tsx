"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 200);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () =>
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

  if (!isVisible) return null;

  return (
    <Button
      type="button"
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 gap-1 rounded-full bg-[#001b48] text-base font-semibold text-white shadow-none transition-colors hover:bg-[#0a275f]"
      aria-label="回到顶部"
    >
      <ArrowUp className="size-5" />
      回到顶部
    </Button>
  );
}
