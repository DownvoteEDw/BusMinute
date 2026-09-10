import { Suspense, type ReactNode } from "react";
import type { Locale } from "../src/application/i18n";
import { TransitBoundary } from "./transit-boundary";
import { TransitLoading } from "./transit-loading";

export function TransitSection({ children, locale, className }: { children: ReactNode; locale: Locale; className?: string })
{
    return (
        <TransitBoundary locale={locale}>
            <Suspense fallback={<TransitLoading locale={locale} className={className} />}>
                {children}
            </Suspense>
        </TransitBoundary>
    );
}
