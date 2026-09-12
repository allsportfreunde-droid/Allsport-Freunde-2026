import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Creates a self-contained production server for the Docker image.
  output: "standalone",
  allowedDevOrigins: ['192.168.2.226'],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
