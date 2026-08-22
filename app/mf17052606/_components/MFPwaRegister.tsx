"use client";
import { useEffect } from "react";

// Registers the MF 2.0 service worker, scoped strictly to /mf17052606 so it
// never touches LMA. Without a registered worker Chrome will not offer to
// install the app at all. Safe no-op if unsupported.
export default function MFPwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/mf17052606/sw.js", { scope: "/mf17052606" })
        .catch(() => { /* ignore registration errors */ });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}