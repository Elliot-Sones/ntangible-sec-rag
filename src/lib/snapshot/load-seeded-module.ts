import { pathToFileURL } from "node:url";

import { createSeededRandom } from "./rng.ts";

let importCounter = 0;
let importQueue = Promise.resolve();

export async function loadSeededModule<T>(modulePath: string, seed: number): Promise<T> {
  return withSeededGlobals(async () => {
    const moduleUrl = `${pathToFileURL(modulePath).href}?seed=${seed}&import=${importCounter++}`;
    return (await import(moduleUrl)) as T;
  }, seed);
}

async function withSeededGlobals<T>(fn: () => Promise<T>, seed: number): Promise<T> {
  const run = importQueue.then(async () => {
    const originalRandom = Math.random;
    const originalDate = Date;
    const fixedDate = createFixedDate(seed);

    Math.random = createSeededRandom(seed);
    globalThis.Date = fixedDate;

    try {
      return await fn();
    } finally {
      Math.random = originalRandom;
      globalThis.Date = originalDate;
    }
  });

  importQueue = run.then(
    () => undefined,
    () => undefined
  );

  return run;
}

function createFixedDate(seed: number): DateConstructor {
  const baseTimestamp = Date.parse("2026-01-01T00:00:00.000Z") + seed * 86_400_000;

  class FixedDate extends Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) {
        super(baseTimestamp);
        return;
      }

      super(args[0] as string | number | Date);
    }

    static now(): number {
      return baseTimestamp;
    }

    static parse(dateString: string): number {
      return Date.parse(dateString);
    }

    static UTC(...args: Parameters<DateConstructor["UTC"]>): number {
      return Date.UTC(...args);
    }
  }

  return FixedDate as DateConstructor;
}
