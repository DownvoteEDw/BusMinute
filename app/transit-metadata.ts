import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation.js";

export async function transitMetadata(load: () => Promise<Metadata>, canonical: string): Promise<Metadata>
{
    try
    {
        const metadata = await load();
        if (!metadata.alternates?.canonical)
        {
            return {
                ...metadata,
                alternates: { ...metadata.alternates, canonical },
                robots: { index: false, follow: true }
            };
        }
        return metadata;
    }
    catch (error)
    {
        unstable_rethrow(error);
        console.error("Métadonnées des horaires indisponibles", error);
        return {
            alternates: { canonical },
            robots: { index: false, follow: true }
        };
    }
}
