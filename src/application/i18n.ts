export const localeCookieName = "busminute_locale";

export type Locale = "en" | "fr";

export function isLocale(value: unknown): value is Locale
{
    return value === "fr" || value === "en";
}

export function normalizeLocale(value: unknown): Locale
{
    return isLocale(value) ? value : "fr";
}

export function localize(locale: Locale, french: string, english: string): string
{
    return locale === "en" ? english : french;
}

export function localeTag(locale: Locale): "en-GB" | "fr-FR"
{
    return locale === "en" ? "en-GB" : "fr-FR";
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
    englishPlural: string
): string
{
    if (locale === "en")
    {
        return `${count} ${count === 1 ? englishSingular : englishPlural}`;
    }

    return `${count} ${count === 1 ? frenchSingular : frenchPlural}`;
}
