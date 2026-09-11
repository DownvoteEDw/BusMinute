import { describe, expect, it } from "vitest";
import { BoundedConcurrency, WorkQueueFullError } from "../../src/application/bounded-concurrency.js";

describe("file de concurrence bornée", () =>
{
    it("borne les travaux actifs et en attente", async () =>
    {
        const queue = new BoundedConcurrency(2, 1);
        const releases: Array<() => void> = [];
        let active = 0;
        let maximumActive = 0;
        const operation = () => queue.run(async () =>
        {
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await new Promise<void>((resolve) => releases.push(resolve));
            active -= 1;
        });
        const first = operation();
        const second = operation();
        const third = operation();
        const rejected = operation();
        await Promise.resolve();

        await expect(rejected).rejects.toBeInstanceOf(WorkQueueFullError);
        expect(active).toBe(2);
        releases.shift()?.();
        await first;
        await Promise.resolve();
        expect(active).toBe(2);
        releases.shift()?.();
        releases.shift()?.();
        await Promise.all([second, third]);
        expect(maximumActive).toBe(2);
    });
});
