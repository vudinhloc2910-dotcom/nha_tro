import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép tải ảnh CCCD / file hợp đồng lên (mỗi lần tối đa vài MB)
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
