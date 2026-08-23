import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StructuredData } from "../components/structured-data";
import { absoluteUrl } from "../src/application/seo";
import "./globals.css";

export const metadata: Metadata = {
    metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
    applicationName: "BusMinute",
    title: {
        default: "BusMinute — Suivi des bus en temps réel",
        template: "%s | BusMinute"
    },
    description: "Horaires, retards et signalements voyageurs pour les cars longue distance.",
    category: "transport",
    keywords: ["suivi bus", "retard bus", "BlaBlaCar Bus", "gare routière", "horaires autocar"],
    openGraph: {
        title: "BusMinute — Suivi des bus en temps réel",
        description: "Votre bus, minute par minute.",
        type: "website",
        locale: "fr_FR",
        siteName: "BusMinute",
        images: [
            {
                url: "/og.png",
                width: 1734,
                height: 907,
                alt: "BusMinute — Votre bus, minute par minute."
            }
        ]
    },
    twitter: {
        card: "summary_large_image",
        title: "BusMinute — Suivi des bus en temps réel",
        description: "Votre bus, minute par minute.",
        images: ["/og.png"]
    },
    robots: {
        index: true,
        follow: true
    }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>)
{
    const structuredData = [
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: "BusMinute",
            url: absoluteUrl("/"),
            logo: absoluteUrl("/og.png")
        },
        {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "BusMinute",
            url: absoluteUrl("/"),
            inLanguage: "fr-FR",
            potentialAction: {
                "@type": "SearchAction",
                target: {
                    "@type": "EntryPoint",
                    urlTemplate: absoluteUrl("/recherche?q={search_term_string}")
                },
                "query-input": "required name=search_term_string"
            }
        }
    ];

    return (
        <html lang="fr">
            <body>
                <header className="site-header">
                    <Link className="brand" href="/" aria-label="BusMinute, accueil">
                        <span className="brand-mark" aria-hidden="true">B</span>
                        <span>BusMinute</span>
                    </Link>
                    <nav aria-label="Navigation principale">
                        <Link href="/">Suivre un bus</Link>
                        <Link href="/villes">Villes et gares</Link>
                        <Link href="/sources">Nos données</Link>
                    </nav>
                </header>
                <main>{children}</main>
                <footer className="site-footer">
                    <span>BusMinute</span>
                    <span>Service indépendant, non affilié à BlaBlaCar.</span>
                </footer>
                <StructuredData value={structuredData} />
            </body>
        </html>
    );
}
