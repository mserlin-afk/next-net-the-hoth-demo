import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@tailwindcss/oxide", "@tailwindcss/oxide-darwin-arm64"],
};

export default nextConfig;
