"use client";

import { localize, type Locale } from "../src/application/i18n";

export function TransitError({ locale, retry }: { locale: Locale; retry: () => void })
{
    return (
        <div className="empty-state" role="alert">
            <h2>{localize(locale, "Les horaires ne sont pas disponibles pour le moment", "Bus times are currently unavailable", "Los horarios no están disponibles en este momento")}</h2>
            <p>{localize(locale, "Vous pouvez réessayer dans un instant.", "You can try again shortly.", "Puedes volver a intentarlo en un momento.")}</p>
            <button type="button" onClick={retry}>{localize(locale, "Réessayer", "Try again", "Volver a intentar")}</button>
        </div>
    );
}
