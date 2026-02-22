import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

type DatabaseConfigSource =
  | "DATABASE_URL"
  | "PG_ENV_FALLBACK"
  | "PG_ENV_OVERRIDE_LOCALHOST"
  | "MISSING";

type ResolvedDatabaseConfig = {
  url?: string;
  source: DatabaseConfigSource;
  host?: string;
  port?: string;
};

function parseHostPort(url?: string): { host?: string; port?: string } {
  if (!url) {
    return {};
  }

  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || undefined,
      port: parsed.port || undefined,
    };
  } catch {
    return {};
  }
}

function isLoopbackHost(host?: string): boolean {
  if (!host) {
    return false;
  }

  const normalized = host.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function buildUrlFromPgEnv(): string | undefined {
  const host = process.env.PGHOST?.trim();
  const user = process.env.PGUSER?.trim();
  const database = process.env.PGDATABASE?.trim();
  if (!host || !user || !database) {
    return undefined;
  }

  const password = process.env.PGPASSWORD ?? "";
  const port = process.env.PGPORT?.trim() || "5432";
  const schema = process.env.PGSCHEMA?.trim() || "public";

  const credentials =
    password.length > 0
      ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
      : encodeURIComponent(user);

  return `postgresql://${credentials}@${host}:${port}/${encodeURIComponent(database)}?schema=${encodeURIComponent(schema)}`;
}

function resolveDatabaseConfig(): ResolvedDatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const pgEnvUrl = buildUrlFromPgEnv();

  const dbEndpoint = parseHostPort(databaseUrl);
  const pgEndpoint = parseHostPort(pgEnvUrl);

  if (!databaseUrl && pgEnvUrl) {
    return {
      url: pgEnvUrl,
      source: "PG_ENV_FALLBACK",
      host: pgEndpoint.host,
      port: pgEndpoint.port,
    };
  }

  if (
    databaseUrl &&
    pgEnvUrl &&
    isLoopbackHost(dbEndpoint.host) &&
    pgEndpoint.host &&
    !isLoopbackHost(pgEndpoint.host)
  ) {
    return {
      url: pgEnvUrl,
      source: "PG_ENV_OVERRIDE_LOCALHOST",
      host: pgEndpoint.host,
      port: pgEndpoint.port,
    };
  }

  if (databaseUrl) {
    return {
      url: databaseUrl,
      source: "DATABASE_URL",
      host: dbEndpoint.host,
      port: dbEndpoint.port,
    };
  }

  return { source: "MISSING" };
}

const resolvedDbConfig = resolveDatabaseConfig();
const prismaOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
};
const shouldLogDbConfig = process.env.NODE_ENV !== "test";

if (resolvedDbConfig.url) {
  prismaOptions.datasources = {
    db: { url: resolvedDbConfig.url },
  };
}

if (shouldLogDbConfig && resolvedDbConfig.source === "PG_ENV_FALLBACK") {
  console.warn(
    `[db] DATABASE_URL not set; using PG* env fallback (${resolvedDbConfig.host ?? "unknown-host"}:${resolvedDbConfig.port ?? "default-port"})`,
  );
} else if (shouldLogDbConfig && resolvedDbConfig.source === "PG_ENV_OVERRIDE_LOCALHOST") {
  console.warn(
    `[db] DATABASE_URL points to loopback; using PG* env instead (${resolvedDbConfig.host ?? "unknown-host"}:${resolvedDbConfig.port ?? "default-port"})`,
  );
} else if (shouldLogDbConfig && resolvedDbConfig.source === "MISSING") {
  console.error("[db] DATABASE_URL is missing and PG* fallback is incomplete");
}

export const prisma =
  global.prisma ??
  new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
