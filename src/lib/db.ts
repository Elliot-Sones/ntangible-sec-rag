import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

import { requireDatabaseUrl } from "./config.ts";

let sqlSingleton: NeonQueryFunction<false, false> | null = null;

export function getDb(): NeonQueryFunction<false, false> {
  if (!sqlSingleton) {
    sqlSingleton = neon(requireDatabaseUrl());
  }

  return sqlSingleton;
}
