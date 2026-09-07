export const localeCookieName = "busminute_locale";

export type Locale = "en" | "es" | "fr";

export function isLocale(value: unknown): value is Locale
{
    return value === "fr" || value === "en" || value === "es";
}

export function normalizeLocale(value: unknown): Locale
{
    return isLocale(value) ? value : "fr";
}

export function localize(locale: Locale, french: string, english: string, spanish: string): string
{
    if (locale === "en")
    {
        return english;
    }

    return locale === "es" ? spanish : french;
}

export function localeTag(locale: Locale): "en-GB" | "es-ES" | "fr-FR"
{
    if (locale === "en")
    {
        return "en-GB";
    }

    return locale === "es" ? "es-ES" : "fr-FR";
}

export function capitalize(value: string, locale: Locale): string
{
    return value.charAt(0).toLocaleUpperCase(localeTag(locale)) + value.slice(1);
}

export function countLabel(
    locale: Locale,
    count: number,
    frenchSingular: string,
    frenchPlural: string,
    englishSingular: string,
    englishPlural: string,
    spanishSingular: string,
    spanishPlural: string
): string
{
    if (locale === "en")
    {
        return `${count} ${count === 1 ? englishSingular : englishPlural}`;
    }

    if (locale === "es")
    {
        return `${count} ${count === 1 ? spanishSingular : spanishPlural}`;
    }

    return `${count} ${count === 1 ? frenchSingular : frenchPlural}`;
}
