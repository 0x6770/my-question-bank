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
      size="icon"
      className="fixed bottom-6 right-6 rounded-full bg-[#001b48] transition-colors hover:bg-[#0a275f]"
      aria-label="Back to top"
    >
      <ArrowUp className="size-5" />
    </Button>
  );
}
