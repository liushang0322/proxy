import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["dockerode"],
  outputFileTracingRoot: path.join(__dirname, "../..")
};

export default nextConfig;
