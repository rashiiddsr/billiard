/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // BUG FIX #1a: output standalone diperlukan untuk deployment di VPS/Hostinger Node.js
  output: 'standalone',

  experimental: {
    serverActions: {
      // BUG FIX #1b: Tambahkan domain production — sebelumnya hanya localhost
      // Ganti 'pos.v-luxe.id' dengan domain kamu jika berbeda
      allowedOrigins: [
        'localhost:3000',
        'pos.v-luxe.id',
        'www.pos.v-luxe.id',
      ],
    },
  },

  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  },

  // BUG FIX #1c: Cache-Control header yang benar
  // - Static chunk assets: boleh di-cache lama (hash berubah setiap build)
  // - HTML pages: jangan pernah di-cache agar tidak stale setelah deploy baru
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
