/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  // ให้ API route timeout นานขึ้นสำหรับ scraping
  experimental: {
    serverComponentsExternalPackages: ['playwright', 'cheerio'],
  },
};

module.exports = nextConfig;
