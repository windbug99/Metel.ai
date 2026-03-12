import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.seeklogo.com",
      },
    ],
  },
};

export default nextConfig;
