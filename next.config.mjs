/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'sifluvnvdgszfchtudkv.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },

  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'style-challenge.vercel.app' }],
        destination: 'https://www.stylechallenge.app/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'stylechallenge.app' }],
        destination: 'https://www.stylechallenge.app/:path*',
        permanent: true,
      },
    ]
  },
}

export default nextConfig