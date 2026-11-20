type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const REDACTED_KEYS = [
  "password",
  "passwordhash",
  "password_hash",
  "secret",
  "signature",
  "authorization",
  "apikey",
  "api_key",
  "cookie",
  "rawbody",
];

function isSensitiveKey(key: string) {
  const normalized = key.toLowerCase();
  return REDACTED_KEYS.some((candidate) =>
    normalized === candidate || normalized.includes(candidate)
  );
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}

function normalizeContext(context: LogContext): LogContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => {
      if (isSensitiveKey(key)) return [key, "[REDACTED]"];
      if (value instanceof Error) return [key, normalizeError(value)];
      if (Array.isArray(value)) {
        return [key, value.map((item) => (
          item && typeof item === "object" ? normalizeContext(item as LogContext) : item
        ))];
      }
      if (value && typeof value === "object") {
        return [key, normalizeContext(value as LogContext)];
      }
      return [key, value];
    })
  );
}

export function log(level: LogLevel, event: string, context: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    ...normalizeContext(context),
  };
  const output = JSON.stringify(entry);

  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

export function logError(event: string, error: unknown, context: LogContext = {}) {
  log("error", event, { ...context, error: normalizeError(error) });
}
