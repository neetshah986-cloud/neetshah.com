import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Partial prefetching streams a 200 before notFound() can set a 404, so it stays off.
  partialPrefetching: false,
};

export default nextConfig;
