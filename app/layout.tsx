import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "../components/language-switcher";
import { StructuredData } from "../components/structured-data";
import { localize } from "../src/application/i18n";
import { requestLocale } from "./request-locale";
import { absoluteUrl } from "../src/application/seo";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata>
{
    const locale = await requestLocale();
    const description = localize(
        locale,
        "Suivez les bus BlaBlaCar Bus et FlixBus en temps réel, consultez leurs retards et les prochains passages en gare.",
        "Track BlaBlaCar Bus and FlixBus services in real time, check delays and view upcoming station departures."
    );
    const socialDescription = localize(
        locale,
        "Suivez votre bus BlaBlaCar Bus ou FlixBus en temps réel et consultez les prochains départs en gare.",
        "Track your BlaBlaCar Bus or FlixBus service in real time and check upcoming station departures."
    );

    return {
        metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
        applicationName: "BusMinute",
        title: {
            default: localize(locale, "BusMinute — Suivi des bus en temps réel", "BusMinute — Live bus tracking"),
            template: "%s | BusMinute"
        },
        description,
        category: "transport",
        keywords: locale === "en"
            ? ["live bus tracking", "bus delay", "BlaBlaCar Bus", "FlixBus", "coach station", "coach times"]
            : ["suivi bus", "retard bus", "BlaBlaCar Bus", "FlixBus", "gare routière", "horaires autocar"],
        openGraph: {
            title: localize(locale, "BusMinute — Bus et retards en temps réel", "BusMinute — Live bus times and delays"),
            description: socialDescription,
            type: "website",
            locale: locale === "en" ? "en_GB" : "fr_FR",
            alternateLocale: locale === "en" ? ["fr_FR"] : ["en_GB"],
            siteName: "BusMinute",
            images: [
                {
                    url: "/og.png",
                    width: 1734,
                    height: 907,
                    alt: localize(locale, "BusMinute — Votre bus, minute par minute.", "BusMinute — Your bus, minute by minute.")
                }
            ]
        },
        twitter: {
            card: "summary_large_image",
            title: localize(locale, "BusMinute — Bus et retards en temps réel", "BusMinute — Live bus times and delays"),
            description: socialDescription,
            images: ["/og.png"]
        },
        robots: {
            index: true,
            follow: true
        }
    };
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>)
{
    const locale = await requestLocale();
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
            inLanguage: locale === "en" ? "en-GB" : "fr-FR",
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
        <html lang={locale}>
            <body>
                <header className="site-header">
                    <Link className="brand" href="/" aria-label={localize(locale, "BusMinute, accueil", "BusMinute, home")}>
                        <span className="brand-mark" aria-hidden="true">B</span>
                        <span>BusMinute</span>
                    </Link>
                    <div className="header-actions">
                        <nav aria-label={localize(locale, "Navigation principale", "Main navigation")}>
                            <Link href="/">{localize(locale, "Suivre un bus", "Track a bus")}</Link>
                            <Link href="/villes">{localize(locale, "Villes et gares", "Cities and stations")}</Link>
                        </nav>
                        <LanguageSwitcher locale={locale} />
                    </div>
                </header>
                <main>{children}</main>
                <footer className="site-footer">
                    <span>BusMinute</span>
                    <span>{localize(locale, "Service indépendant, non affilié aux opérateurs.", "Independent service, not affiliated with the operators.")}</span>
                </footer>
                <StructuredData value={structuredData} />
                <Script
                    defer
                    src="https://analytics.bopomofo-master.xyz/script.js"
                    data-website-id="153fbeff-a8c0-4fad-a62e-4030ad09abea"
                    strategy="afterInteractive"
                />
            </body>
        </html>
    );
}
