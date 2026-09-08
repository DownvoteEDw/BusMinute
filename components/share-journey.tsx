"use client";

import { useState } from "react";
import { localize, type Locale } from "../src/application/i18n";

export function ShareJourney({ path, title, locale }: { path: string; title: string; locale: Locale })
{
    const [feedback, setFeedback] = useState<string | null>(null);
    const [sharedUrl, setSharedUrl] = useState<string | null>(null);

    async function share(): Promise<void>
    {
        const url = new URL(path, window.location.origin).href;
        setSharedUrl(url);
        try
        {
            await navigator.clipboard.writeText(url);
            setFeedback(localize(locale, "Lien copié", "Link copied", "Enlace copiado"));
        }
        catch
        {
            setFeedback(localize(locale, "Copiez ce lien pour partager ce départ.", "Copy this link to share this departure.", "Copia este enlace para compartir esta salida."));
        }
    }

    return (
        <div className="journey-share">
            <button type="button" title={title} onClick={() => void share()}>{localize(locale, "Partager ce trajet", "Share this journey", "Compartir este trayecto")}</button>
            {sharedUrl && <input aria-label={localize(locale, "Lien de ce trajet", "Journey link", "Enlace del trayecto")} readOnly value={sharedUrl} onFocus={(event) => event.currentTarget.select()} />}
            {feedback && <span role="status">{feedback}</span>}
        </div>
    );
}
