import type { NextConfig } from "next"

// Floorplan PDFs go straight from the browser to Supabase Storage, so no
// server action ever carries them and the default body limit is plenty.
const nextConfig: NextConfig = {}

export default nextConfig
