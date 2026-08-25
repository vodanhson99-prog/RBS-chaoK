import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: { root: __dirname },
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async rewrites() {
    const apiPort = process.env.API_PORT || '8787'
    const apiBase = `http://127.0.0.1:${apiPort}`
    return [
      { source: '/readyz', destination: `${apiBase}/readyz` },
      { source: '/api/:path*', destination: `${apiBase}/api/:path*` },
    ]
  },
}

export default nextConfig
