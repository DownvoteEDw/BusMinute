interface CacheEntry<T>
{
    value: T;
    expiresAt: number;
}

export class AsyncCache<T>
{
    private readonly entries = new Map<string, CacheEntry<T>>();
    private readonly pending = new Map<string, Promise<T>>();

    public constructor(private readonly lifetimeMilliseconds: number, private readonly maximumEntries = 1)
    {
    }

    public get(key: string, load: () => Promise<T>): Promise<T>
    {
        const cached = this.entries.get(key);

        if (cached && cached.expiresAt > Date.now())
        {
            return Promise.resolve(cached.value);
        }

        const pending = this.pending.get(key);

        if (pending)
        {
            return pending;
        }

        const request = Promise.resolve().then(load).then((value) =>
        {
            this.entries.delete(key);

            for (const [entryKey, entry] of this.entries)
            {
                if (entry.expiresAt <= Date.now())
                {
                    this.entries.delete(entryKey);
                }
            }

            if (this.entries.size >= this.maximumEntries)
            {
                const oldest = this.entries.keys().next().value;

                if (oldest !== undefined)
                {
                    this.entries.delete(oldest);
                }
            }

            this.entries.set(key, { value, expiresAt: Date.now() + this.lifetimeMilliseconds });
            return value;
        }).finally(() =>
        {
            this.pending.delete(key);
        });
        this.pending.set(key, request);
        return request;
    }
}
