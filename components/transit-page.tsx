import { Suspense, type ReactNode } from "react";
import { localize, type Locale } from "../src/application/i18n";
import { SearchBox } from "./search-box";
import { TransitBoundary } from "./transit-boundary";
import { TransitLoading } from "./transit-loading";

export function TransitPage({ children, locale, title }: { children: ReactNode; locale: Locale; title: string })
{
    return (
        <TransitBoundary locale={locale}>
            <Suspense fallback={
                <div className="page-shell listing-page">
                    <header className="listing-heading">
                        <span className="section-kicker">BusMinute</span>
                        <h1>{title}</h1>
                        <p>{localize(locale, "Retrouvez vos gares, vos horaires et votre bus.", "Find your stations, times and bus.", "Encuentra tus estaciones, horarios y autobús.")}</p>
                        <SearchBox compact locale={locale} />
                    </header>
                    <TransitLoading locale={locale} />
                </div>
            }>
                {children}
            </Suspense>
        </TransitBoundary>
    );
}
