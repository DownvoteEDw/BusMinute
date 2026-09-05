"use client";

import { useRouter } from "next/navigation";
import { type ChangeEvent, useState } from "react";
import type { Locale } from "../src/application/i18n";

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
            <span>{locale === "en" ? "Language" : "Langue"}</span>
            <select
                aria-label={locale === "en" ? "Choose language" : "Choisir la langue"}
                disabled={pending}
                onChange={(event) => void changeLanguage(event)}
                value={locale}
            >
                <option value="fr">FR</option>
                <option value="en">EN</option>
            </select>
        </label>
    );
}
