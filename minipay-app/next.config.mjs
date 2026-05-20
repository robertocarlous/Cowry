/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for MiniPay — disable strict mode to avoid double-effects
  // triggering wallet connections twice
  reactStrictMode: false,
};

export default nextConfig;
