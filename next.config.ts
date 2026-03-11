import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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