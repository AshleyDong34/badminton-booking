"use client";

import { useEffect } from "react";

export default function HashAnchorRestore() {
  useEffect(() => {
    if (!window.location.hash) return;

    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;

    const scrollToAnchor = () => {
      const target = document.getElementById(id);
      if (!target) return;
      target.scrollIntoView({ block: "start", inline: "nearest" });
    };

    // Run multiple passes to absorb layout shifts after server render + hydration.
    scrollToAnchor();
    const first = window.setTimeout(scrollToAnchor, 80);
    const second = window.setTimeout(scrollToAnchor, 220);

    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, []);

  return null;
}

