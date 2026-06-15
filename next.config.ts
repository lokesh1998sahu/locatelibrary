import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Each sub-app's service worker lives INSIDE its own folder (e.g.
    // /lma960805/sw.js). By default that limits its max scope to "/lma960805/", which would
    // NOT control the bare start_url "/lma960805" (no trailing slash). These headers
    // raise the allowed scope so each SW can register scope:"/<app>" and control
    // its whole app — while still being unable to touch the other apps.
    const swHeader = (value: string) => ({ key: "Service-Worker-Allowed", value });
    return [
      { source: "/lma960805/sw.js", headers: [swHeader("/lma960805")] },
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