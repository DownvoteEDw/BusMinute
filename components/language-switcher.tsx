"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useState } from "react";
import { localize, type Locale } from "../src/application/i18n";

interface LanguageSwitcherProps
{
    locale: Locale;
}

export function LanguageSwitcher({ locale }: LanguageSwitcherProps)
{
    const router = useRouter();
    const [pending, setPending] = useState(false);

    async function changeLanguage(event: ChangeEvent<HTMLSelectElement>): Promise<void>
    {
        const selectedLocale = event.target.value as Locale;
        setPending(true);

        try
        {
            const response = await fetch("/api/locale",
            {
                body: JSON.stringify({ locale: selectedLocale }),
                headers: { "Content-Type": "application/json" },
                method: "POST"
            });

            if (response.ok)
            {
                router.refresh();
            }
        }
        finally
        {
            setPending(false);
        }
    }

    return (
        <label className="language-switcher">
            <span>{localize(locale, "Langue", "Language", "Idioma")}</span>
            <select
                aria-label={localize(locale, "Choisir la langue", "Choose language", "Elegir idioma")}
                disabled={pending}
                onChange={(event) => void changeLanguage(event)}
                value={locale}
            >
                <option value="fr">FR</option>
                <option value="en">EN</option>
                <option value="es">ES</option>
            </select>
        </label>
    );
}
