"use client";
import { useEffect } from "react";

// Registers the LMA service worker, scoped strictly to /lma so it never
// touches the other apps sharing this domain. Safe no-op if unsupported.
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/lma/sw.js", { scope: "/lma" })
        .catch(() => { /* ignore registration errors */ });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}