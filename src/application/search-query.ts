export const maximumSearchQueryCharacters = 160;
export const maximumSearchQueryBytes = 512;
export const maximumSearchQueryWords = 16;

export function isSearchQueryWithinLimits(value: string): boolean
{
    const trimmed = value.trim();
    const wordCount = trimmed.match(/\S+/g)?.length ?? 0;
    return trimmed.length <= maximumSearchQueryCharacters
        && new TextEncoder().encode(trimmed).byteLength <= maximumSearchQueryBytes
        && wordCount <= maximumSearchQueryWords;
}
