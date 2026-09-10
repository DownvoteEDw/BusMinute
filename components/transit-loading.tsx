import { localize, type Locale } from "../src/application/i18n";

export function TransitLoading({ locale, className = "" }: { locale: Locale; className?: string })
{
    return (
        <div className={`transit-loading ${className}`} role="status" aria-live="polite" aria-busy="true">
            <strong>{localize(locale, "Recherche des horaires…", "Finding bus times…", "Buscando horarios…")}</strong>
            <span>{localize(locale, "Les prochains passages s’affichent dans un instant.", "Upcoming services will appear shortly.", "Las próximas salidas aparecerán en un momento.")}</span>
            <div className="transit-loading-lines" aria-hidden="true"><i /><i /><i /></div>
        </div>
    );
}
