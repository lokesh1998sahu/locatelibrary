import postgres from "postgres";

// One shared Postgres connection for the whole server runtime.
// prepare:false is REQUIRED for Supabase's Transaction pooler (port 6543 / pgBouncer).
// The global cache prevents new pools on every hot-reload in dev. It is KEYED to the
// connection string: if DATABASE_URL changes (e.g. staging -> production), the old
// pool is closed and rebuilt instead of silently serving stale connections.
declare global {
  // eslint-disable-next-line no-var
  var __lma_sql: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __lma_sql_url: string | undefined;
}

const DB_URL = process.env.DATABASE_URL!;

if (globalThis.__lma_sql && globalThis.__lma_sql_url !== DB_URL) {
  const stale = globalThis.__lma_sql;
  globalThis.__lma_sql = undefined;
  globalThis.__lma_sql_url = undefined;
  void Promise.resolve(stale.end({ timeout: 5 })).catch(() => {});
}

const sql =
  globalThis.__lma_sql ??
  postgres(DB_URL, {
    prepare: false,
    idle_timeout: 20,
    // 10 > the 6-way Promise.all in getInitData/getDashboard (a pool of 5 could stall)
    max: 10,
    // fail fast with a clear error instead of hanging forever on a dead host
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__lma_sql = sql;
  globalThis.__lma_sql_url = DB_URL;
}

export default sql;