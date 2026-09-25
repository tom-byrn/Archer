/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@archer/lang", "@archer/catalog", "@archer/mcp"],
  experimental: {
    // Phosphor's index re-exports every icon; compile only the ones ui.tsx imports.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  // The routes were once `/d` and `/s`; share links and README image embeds
  // in the wild (and older CLI/MCP builds) still point at the short paths.
  async redirects() {
    return [
      { source: "/d/:id", destination: "/documents/:id", permanent: true },
      { source: "/s/:path*", destination: "/share/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
