import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    agentRules: false,
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    experimental: {
        cpus: 2,
        webpackMemoryOptimizations: true
    },
    output: "standalone",
    poweredByHeader: false,
    turbopack: {
        root: process.cwd()
    },
    webpack(config)
    {
        config.resolve.extensionAlias = {
            ...config.resolve.extensionAlias,
            ".js": [".ts", ".tsx", ".js"]
        };
        return config;
    }
};

export default nextConfig;
