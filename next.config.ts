import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    agentRules: false,
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    // Liste par défaut de Next.js + Googlebot : ses métadonnées sont résolues avant le premier octet,
    // donc une panne de données répond 5xx au lieu d'une page 200 sans titre.
    htmlLimitedBots: /Googlebot|[\w-]+-Google|Google-[\w-]+|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight/i,
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
