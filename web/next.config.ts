import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: { root: __dirname },
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: 'http://127.0.0.1:8787/api/:path*' }]
  },
}

export default nextConfig
