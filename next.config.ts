import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse","tesseract.js"],
};

export default nextConfig;
