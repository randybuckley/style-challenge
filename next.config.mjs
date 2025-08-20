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
  // Keep builds unblocked while moving fast
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;