import { localeTag, localize, type Locale } from "./i18n.js";
import type { JourneyView } from "./journey-view.js";
import { isJourneyCompleted } from "./seo.js";

export function journeyDateLabel(journey: JourneyView, locale: Locale, now = new Date()): string
{
    if (isJourneyCompleted(journey, now))
    {
        return localize(locale, "Trajet terminé", "Journey completed", "Trayecto finalizado");
    }
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
    const today = formatter.format(now);
    const tomorrow = new Date(new Date(`${today}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    if (journey.serviceDate === today)
    {
        return localize(locale, "Aujourd’hui", "Today", "Hoy");
    }
    if (journey.serviceDate === tomorrow)
    {
        return localize(locale, "Demain", "Tomorrow", "Mañana");
    }
    return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: "medium", timeZone: "Europe/Paris" })
        .format(new Date(`${journey.serviceDate}T12:00:00Z`));
}
