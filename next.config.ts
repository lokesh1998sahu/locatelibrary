import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Each sub-app's service worker lives INSIDE its own folder (e.g.
    // /lma/sw.js). By default that limits its max scope to "/lma/", which would
    // NOT control the bare start_url "/lma" (no trailing slash). These headers
    // raise the allowed scope so each SW can register scope:"/<app>" and control
    // its whole app — while still being unable to touch the other apps.
    const swHeader = (value: string) => ({ key: "Service-Worker-Allowed", value });
    return [
      { source: "/lma/sw.js", headers: [swHeader("/lma")] },
      { source: "/whatsapp/sw.js", headers: [swHeader("/whatsapp")] },
      { source: "/tech-tool/sw.js", headers: [swHeader("/tech-tool")] },
    ];
  },
  async redirects() {
    return [
      {
        source: "/",
        has: [
          {
            type: "host",
            value: "finance.locatelibrary.com",
          },
        ],
        destination: "/mf-2",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;