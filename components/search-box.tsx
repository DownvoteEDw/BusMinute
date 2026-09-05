"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { countLabel, localize, type Locale } from "../src/application/i18n";
import type { JourneyView, PlaceSearchResultView } from "../src/application/journey-view";

interface SearchBoxProps
{
    initialQuery?: string;
    compact?: boolean;
    locale?: Locale;
}

export function SearchBox({ initialQuery = "", compact = false, locale = "fr" }: SearchBoxProps)
{
    const router = useRouter();
    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<JourneyView[]>([]);
    const [places, setPlaces] = useState<PlaceSearchResultView[]>([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const requestNumber = useRef(0);

    useEffect(() =>
    {
        const normalized = query.trim();

        if (normalized.length < 2)
        {
            setResults([]);
            setPlaces([]);
            setOpen(false);
            return;
        }

        const controller = new AbortController();
        const currentRequest = requestNumber.current + 1;
        requestNumber.current = currentRequest;
        const timeout = window.setTimeout(async () =>
        {
            setLoading(true);

            try
            {
                const response = await fetch(`/api/search?q=${encodeURIComponent(normalized)}`,
                {
                    cache: "no-store",
                    signal: controller.signal
                });
                const data = await response.json() as
                {
                    journeys?: JourneyView[];
                    places?: PlaceSearchResultView[];
                };

                if (currentRequest === requestNumber.current)
                {
                    setResults(data.journeys ?? []);
                    setPlaces(data.places ?? []);
                    setOpen(true);
                }
            }
            catch (error)
            {
                if (!(error instanceof DOMException && error.name === "AbortError"))
                {
                    setResults([]);
                    setPlaces([]);
                }
            }
            finally
            {
                if (currentRequest === requestNumber.current)
                {
                    setLoading(false);
                }
            }
        }, 220);

        return () =>
        {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [query]);

    function submit(event: FormEvent<HTMLFormElement>): void
    {
        event.preventDefault();
        const firstPlace = places[0];
        const first = results[0];

        if (firstPlace)
        {
            router.push(firstPlace.href);
            return;
        }

        if (first)
        {
            router.push(`/suivi/${encodeURIComponent(first.journeyRef)}`);
            return;
        }

        if (query.trim().length >= 2)
        {
            router.push(`/recherche?q=${encodeURIComponent(query.trim())}`);
        }
    }

    function choose(journey: JourneyView): void
    {
        setOpen(false);
        router.push(`/suivi/${encodeURIComponent(journey.journeyRef)}`);
    }

    function choosePlace(place: PlaceSearchResultView): void
    {
        setOpen(false);
        router.push(place.href);
    }

    return (
        <div className={`search-shell ${compact ? "is-compact" : ""}`}>
            <form className="search-box" onSubmit={submit} role="search">
                <label htmlFor={compact ? "service-number-compact" : "service-number"}>{localize(locale, "Numéro, ville ou trajet", "Bus number, city or route")}</label>
                <div>
                    <input
                        autoComplete="off"
                        id={compact ? "service-number-compact" : "service-number"}
                        name="q"
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={() => setOpen(results.length > 0 || places.length > 0)}
                        placeholder={localize(locale, "Ex. 50819 ou Paris → Tours", "E.g. 50819 or Paris → Tours")}
                        value={query}
                    />
                    <button type="submit">{loading ? localize(locale, "Recherche…", "Searching…") : localize(locale, "Rechercher", "Search")}</button>
                </div>
            </form>
            {open && (
                <div className="search-results" role="listbox" aria-label={localize(locale, "Résultats de recherche", "Search results")}>
                    {places.length === 0 && results.length === 0 ? (
                        <p>{localize(
                            locale,
                            "Aucun bus trouvé aujourd’hui. Essayez une ville, un numéro ou un trajet comme Paris → Tours.",
                            "No buses found today. Try a city, bus number or route such as Paris → Tours."
                        )}</p>
                    ) : (
                        <>
                            {places.map((place) =>
                            {
                                return (
                                    <button key={`${place.type}-${place.id}`} onClick={() => choosePlace(place)} role="option">
                                        <span><b>{place.label}</b><small>{placeDetail(place, locale)}</small></span>
                                        <span className="place-result-type">{place.type === "city" ? localize(locale, "Ville", "City") : localize(locale, "Gare", "Station")}</span>
                                    </button>
                                );
                            })}
                            {results.map((journey) =>
                            {
                                return (
                                    <button key={journey.journeyRef} onClick={() => choose(journey)} role="option">
                                        <span><b>{journey.operatorName} · Bus {journey.serviceNumber}</b><small>{journey.originCity} → {journey.destinationCity}</small></span>
                                        <span className={`result-delay ${delayClass(journey.delaySeconds)}`}>{formatDelay(journey, locale)}</span>
                                    </button>
                                );
                            })}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function formatDelay(journey: JourneyView, locale: Locale): string
{
    const seconds = journey.delaySeconds;

    if (seconds === null)
    {
        return journey.realtimeObserved
            ? localize(locale, "À venir", "Upcoming")
            : localize(locale, "Horaire prévu", "Scheduled");
    }

    const minutes = Math.round(seconds / 60);

    if (minutes === 0)
    {
        return localize(locale, "À l'heure", "On time");
    }

    return minutes > 0 ? `+${minutes} min` : `${minutes} min`;
}

function placeDetail(place: PlaceSearchResultView, locale: Locale): string
{
    if (locale === "fr" || place.type !== "city")
    {
        return place.detail;
    }

    const count = Number.parseInt(place.detail, 10);
    return Number.isFinite(count)
        ? countLabel(locale, count, "gare", "gares", "station", "stations")
        : place.detail;
}

function delayClass(seconds: number | null): string
{
    if (seconds === null || Math.abs(seconds) < 300)
    {
        return "on-time";
    }

    return seconds > 0 ? "late" : "early";
}
