import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 真机测试：放行局域网 IP 访问 dev server（否则 HMR/水合被跨源保护阻断）
  allowedDevOrigins: ["192.168.18.129"],
  async headers() {
    return [
      {
        // iOS Safari 只对这个 MIME 类型弹「安装描述文件」
        source: "/rootCA.mobileconfig",
        headers: [{ key: "Content-Type", value: "application/x-apple-aspen-config" }],
      },
    ];
  },
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
