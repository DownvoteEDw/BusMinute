import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "../components/language-switcher";
import { StructuredData } from "../components/structured-data";
import { localeTag, localize } from "../src/application/i18n";
import { requestLocale } from "./request-locale";
import { absoluteUrl } from "../src/application/seo";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./journey-map.css";

export async function generateMetadata(): Promise<Metadata>
{
    const locale = await requestLocale();
    const description = localize(
        locale,
        "Suivez les bus Alsa, BlaBlaCar Bus et FlixBus en temps réel, avec les prochains passages et retards en gare.",
        "Track Alsa, BlaBlaCar Bus and FlixBus services live, with upcoming station departures and delays.",
        "Sigue en tiempo real los autobuses de Alsa, BlaBlaCar Bus y FlixBus, con las próximas salidas y los retrasos en cada estación."
    );
    const socialDescription = localize(
        locale,
        "Suivez votre bus Alsa, BlaBlaCar Bus ou FlixBus en temps réel.",
        "Track your Alsa, BlaBlaCar Bus or FlixBus service live.",
        "Sigue tu autobús de Alsa, BlaBlaCar Bus o FlixBus en tiempo real."
    );

    return {
        metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
        applicationName: "BusMinute",
        title: {
            default: localize(locale, "BusMinute — Suivi des bus en temps réel", "BusMinute — Live bus tracking", "BusMinute — Autobuses en tiempo real"),
            template: "%s | BusMinute"
        },
        description,
        category: "transport",
        keywords: locale === "en"
            ? ["live bus tracking", "bus delay", "BlaBlaCar Bus", "FlixBus", "Alsa", "coach station", "coach times"]
            : locale === "es"
                ? ["autobuses en tiempo real", "retraso autobús", "BlaBlaCar Bus", "FlixBus", "Alsa", "estación de autobuses", "horarios de autobús"]
                : ["suivi bus", "retard bus", "BlaBlaCar Bus", "FlixBus", "Alsa", "gare routière", "horaires autocar"],
        openGraph: {
            title: localize(locale, "BusMinute — Bus et retards en temps réel", "BusMinute — Live bus times and delays", "BusMinute — Autobuses y retrasos en tiempo real"),
            description: socialDescription,
            type: "website",
            locale: locale === "en" ? "en_GB" : locale === "es" ? "es_ES" : "fr_FR",
            alternateLocale: locale === "en"
                ? ["fr_FR", "es_ES"]
                : locale === "es"
                    ? ["fr_FR", "en_GB"]
                    : ["en_GB", "es_ES"],
            siteName: "BusMinute",
            images: [
                {
                    url: "/og.png",
                    width: 1734,
                    height: 907,
                    alt: localize(locale, "BusMinute — Votre bus, minute par minute.", "BusMinute — Your bus, minute by minute.", "BusMinute — Tu autobús, minuto a minuto.")
                }
            ]
        },
        twitter: {
            card: "summary_large_image",
            title: localize(locale, "BusMinute — Bus et retards en temps réel", "BusMinute — Live bus times and delays", "BusMinute — Autobuses y retrasos en tiempo real"),
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
            inLanguage: localeTag(locale),
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
                    <Link className="brand" href="/" aria-label={localize(locale, "BusMinute, accueil", "BusMinute, home", "BusMinute, inicio")}>
                        <span className="brand-mark" aria-hidden="true">B</span>
                        <span>BusMinute</span>
                    </Link>
                    <div className="header-actions">
                        <nav aria-label={localize(locale, "Navigation principale", "Main navigation", "Navegación principal")}>
                            <Link href="/">{localize(locale, "Suivre un bus", "Track a bus", "Seguir un autobús")}</Link>
                            <Link href="/villes">{localize(locale, "Villes et gares", "Cities and stations", "Ciudades y estaciones")}</Link>
                        </nav>
                        <LanguageSwitcher locale={locale} />
                    </div>
                </header>
                <main>{children}</main>
                <footer className="site-footer">
                    <span>BusMinute</span>
                    <span>{localize(locale, "Service indépendant, non affilié aux opérateurs.", "Independent service, not affiliated with the operators.", "Servicio independiente, no afiliado a los operadores.")}</span>
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
