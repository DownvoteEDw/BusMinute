import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    agentRules: false,
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    async redirects()
    {
        return [
            {
                source: "/:path*",
                has: [
                    {
                        type: "host",
                        value: "www.bus-minute.xyz"
                    }
                ],
                destination: "https://bus-minute.xyz/:path*",
                permanent: true
            }
        ];
    },
    experimental: {
        cpus: 1,
        webpackBuildWorker: true,
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
