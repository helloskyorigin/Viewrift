/** A small bounded pool. Preserves parallel completion and never starts more
 * than limit workers at once. Device results are emitted as each task completes. */
export async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  const poolSize = Math.min(items.length, Math.max(1, Math.floor(limit)));
  let cursor = 0;
  await Promise.all(Array.from({ length: poolSize }, async () => {
    while (cursor < items.length) {
      const next = items[cursor++];
      await handler(next);
    }
  }));
}
