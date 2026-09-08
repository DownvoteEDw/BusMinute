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
        try
        {
            await navigator.clipboard.writeText(url);
            setSharedUrl(null);
            setFeedback(localize(locale, "Lien copié", "Link copied", "Enlace copiado"));
        }
        catch
        {
            setSharedUrl(url);
            setFeedback(localize(locale, "Copiez ce lien pour partager ce départ.", "Copy this link to share this departure.", "Copia este enlace para compartir esta salida."));
        }
    }

    return (
        <div className="journey-share">
            <button type="button" title={title} onClick={() => void share()}>
                <span>{localize(locale, "Partager ce trajet", "Share this journey", "Compartir este trayecto")}</span>
                <span aria-hidden="true" className="journey-share-icon">↗</span>
            </button>
            {feedback && (
                <div className="journey-share-feedback" role="status">
                    <strong>{feedback}</strong>
                    {sharedUrl && <input aria-label={localize(locale, "Lien de ce trajet", "Journey link", "Enlace del trayecto")} readOnly value={sharedUrl} onFocus={(event) => event.currentTarget.select()} />}
                </div>
            )}
        </div>
    );
}
