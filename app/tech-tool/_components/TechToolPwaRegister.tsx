"use client";
import { useEffect } from "react";

// Registers the Tech Tool service worker, scoped strictly to /tech-tool so it
// never touches the other apps sharing this domain. The /tech-tool/sw.js script
// is served with a `Service-Worker-Allowed: /tech-tool` header (see
// next.config.ts) which makes the no-trailing-slash scope valid. Safe no-op if
// service workers are unsupported.
export default function TechToolPwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/tech-tool/sw.js", { scope: "/tech-tool" })
        .catch(() => { /* ignore registration errors */ });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
