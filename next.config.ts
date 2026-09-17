import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingIncludes: {
    "/api/result-image": ["./public/images/results/*.png", "./src/app/icon.png", "./assets/result-image/*"],
  },
};

export default nextConfig;
