export const maximumJsonBodyBytes = 16 * 1024;

export class JsonBodyTooLargeError extends Error
{
}

export async function readJsonBody(request: Request, maximumBytes = maximumJsonBodyBytes): Promise<unknown>
{
    const contentLength = request.headers.get("content-length");

    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maximumBytes)
    {
        throw new JsonBodyTooLargeError();
    }

    if (!request.body)
    {
        return JSON.parse("");
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;

    try
    {
        while (true)
        {
            const { done, value } = await reader.read();

            if (done)
            {
                break;
            }

            size += value.byteLength;

            if (size > maximumBytes)
            {
                await reader.cancel().catch(() => undefined);
                throw new JsonBodyTooLargeError();
            }

            chunks.push(value);
        }
    }
    finally
    {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(size);
    let offset = 0;

    for (const chunk of chunks)
    {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    return JSON.parse(new TextDecoder().decode(bytes));
}
