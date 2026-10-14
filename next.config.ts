import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Netlify's Next.js runtime does not consistently forward CONTEXT to
  // server functions. Compile the non-secret deployment context into the
  // build so preview-only gates remain deterministic after deployment.
  env: {
    NEXT_PUBLIC_NETLIFY_CONTEXT: process.env.CONTEXT || "local",
    NEXT_PUBLIC_NETLIFY_SITE_ORIGIN: process.env.CONTEXT === "production"
      ? "https://yieldvaccum.xyz"
      : process.env.DEPLOY_PRIME_URL || "",
  },
};

export default nextConfig;
