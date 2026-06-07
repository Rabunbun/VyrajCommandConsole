import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.evetech.net"
      }
    ]
  }
};

export default nextConfig;
