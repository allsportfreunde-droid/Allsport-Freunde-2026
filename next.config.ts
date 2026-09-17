import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Creates a self-contained production server for the Docker image.
  output: "standalone",
  allowedDevOrigins: ['172.17.0.1'],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
};

export default nextConfig;
