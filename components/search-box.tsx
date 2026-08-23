"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { JourneyView, PlaceSearchResultView } from "../src/application/journey-view";

interface SearchBoxProps
{
    initialQuery?: string;
    compact?: boolean;
}

export function SearchBox({ initialQuery = "", compact = false }: SearchBoxProps)
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
                <label htmlFor={compact ? "service-number-compact" : "service-number"}>Numéro, ville ou trajet</label>
                <div>
                    <input
                        autoComplete="off"
                        id={compact ? "service-number-compact" : "service-number"}
                        name="q"
                        onChange={(event) => setQuery(event.target.value)}
                        onFocus={() => setOpen(results.length > 0)}
                        placeholder="Ex. 50819, Paris, Tours"
                        value={query}
                    />
                    <button type="submit">{loading ? "Recherche…" : "Voir le direct"}</button>
                </div>
            </form>
            {open && (
                <div className="search-results" role="listbox" aria-label="Circulations trouvées">
                    {places.length === 0 && results.length === 0 ? (
                        <p>Aucune circulation trouvée dans le flux actuel.</p>
                    ) : (
                        <>
                            {places.map((place) =>
                            {
                                return (
                                    <button key={`${place.type}-${place.id}`} onClick={() => choosePlace(place)} role="option">
                                        <span><b>{place.label}</b><small>{place.detail}</small></span>
                                        <span className="place-result-type">{place.type === "city" ? "Ville" : "Gare"}</span>
                                    </button>
                                );
                            })}
                            {results.map((journey) =>
                            {
                                return (
                                    <button key={journey.journeyRef} onClick={() => choose(journey)} role="option">
                                        <span><b>Bus {journey.serviceNumber}</b><small>{journey.originCity} → {journey.destinationCity}</small></span>
                                        <span className={`result-delay ${delayClass(journey.delaySeconds)}`}>{formatDelay(journey.delaySeconds)}</span>
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

function formatDelay(seconds: number | null): string
{
    if (seconds === null)
    {
        return "Prévu";
    }

    const minutes = Math.round(seconds / 60);

    if (minutes === 0)
    {
        return "À l'heure";
    }

    return minutes > 0 ? `+${minutes} min` : `${minutes} min`;
}

function delayClass(seconds: number | null): string
{
    if (seconds === null || Math.abs(seconds) < 300)
    {
        return "on-time";
    }

    return seconds > 0 ? "late" : "early";
}
