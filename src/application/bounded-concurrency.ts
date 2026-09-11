export class WorkQueueFullError extends Error
{
}

export class BoundedConcurrency
{
    private active = 0;
    private readonly waiters: Array<() => void> = [];

    public constructor(
        private readonly maximumActive: number,
        private readonly maximumWaiting: number
    )
    {
    }

    public async run<T>(operation: () => Promise<T>): Promise<T>
    {
        await this.acquire();

        try
        {
            return await operation();
        }
        finally
        {
            this.release();
        }
    }

    private acquire(): Promise<void>
    {
        if (this.active < this.maximumActive)
        {
            this.active += 1;
            return Promise.resolve();
        }

        if (this.waiters.length >= this.maximumWaiting)
        {
            return Promise.reject(new WorkQueueFullError());
        }

        return new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    private release(): void
    {
        const next = this.waiters.shift();

        if (next)
        {
            next();
            return;
        }

        this.active -= 1;
    }
}
