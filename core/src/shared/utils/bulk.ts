import { errorMessage } from "./errorMessage.ts";

export async function runEach<T>(
  items: readonly T[],
  nameOf: (item: T) => string,
  run: (item: T) => Promise<unknown>,
) {
  const failures: string[] = [];

  for (const item of items) {
    try {
      await run(item);
    } catch (error) {
      failures.push(`${nameOf(item)}: ${errorMessage(error)}`);
    }
  }

  return { count: items.length - failures.length, failures };
}
