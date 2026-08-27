import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Floorplan PDFs routinely exceed the 1MB default. Keep this in sync
      // with MAX_UPLOAD_BYTES in lib/floorplans.ts.
      bodySizeLimit: "25mb",
    },
  },
}

export default nextConfig
