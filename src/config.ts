/**
 * Settings, read from the environment.
 *
 * A value that cannot be read warns and falls back rather than stopping the
 * server: a typo in one variable should not take away every tool. Warnings go to
 * stderr, because stdout carries the protocol and anything written there
 * corrupts the session.
 */

import { INSTANCES, type InstanceId } from "./stashbox/instances.js";
import { PKG_NAME, PKG_VERSION, CONTACT_URL } from "./version.js";

export const LOG_LEVELS = ["silent", "error", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * The floor on spacing, which configuration can widen and never narrow.
 *
 * These catalogues are community-run and donation-funded, and none of them
 * publishes a limit. An unstated limit is settled conservatively. Discovering it
 * would mean driving requests until they are refused.
 */
export const MIN_ALLOWED_INTERVAL_MS = 1000;
/** Beyond this a request looks hung. */
export const MAX_ALLOWED_INTERVAL_MS = 60_000;

export interface Config {
  /** Keys per catalogue. A catalogue with no key is not configured. */
  keys: Partial<Record<InstanceId, string>>;
  userAgent: string;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  logLevel: LogLevel;
}

export const DEFAULT_USER_AGENT = `${PKG_NAME}/${PKG_VERSION} (+${CONTACT_URL})`;

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(level: LogLevel): Logger {
  const rank = LOG_LEVELS.indexOf(level);
  const write = (at: LogLevel, message: string) => {
    if (rank === 0 || LOG_LEVELS.indexOf(at) > rank) return;
    process.stderr.write(`[${PKG_NAME}] ${at}: ${message}\n`);
  };
  return {
    debug: (m) => write("debug", m),
    info: (m) => write("info", m),
    // A warning goes out at the error level so it survives the default setting:
    // a caller has to know that a catalogue was left out.
    warn: (m) => write("error", m),
    error: (m) => write("error", m),
  };
}

function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    process.stderr.write(
      `[${PKG_NAME}] error: ${name}="${raw}" is not a whole number; using ${fallback}.\n`,
    );
    return fallback;
  }
  if (value < min || value > max) {
    // Clamping silently would let a caller believe a setting took effect when
    // the opposite is true, so the refusal is stated and the default stands.
    process.stderr.write(
      `[${PKG_NAME}] error: ${name}=${value} is outside ${min}..${max}; using ${fallback}.\n`,
    );
    return fallback;
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const level = env.SB_LOG_LEVEL as LogLevel | undefined;
  const logLevel = level && LOG_LEVELS.includes(level) ? level : "error";
  if (level && !LOG_LEVELS.includes(level)) {
    process.stderr.write(
      `[${PKG_NAME}] error: SB_LOG_LEVEL="${level}" is not one of ${LOG_LEVELS.join(", ")}; using error.\n`,
    );
  }

  const keys: Partial<Record<InstanceId, string>> = {};
  for (const spec of INSTANCES) {
    const value = env[spec.envVar]?.trim();
    if (value) keys[spec.id] = value;
  }

  const custom = env.SB_USER_AGENT?.trim();

  return {
    keys,
    // A caller who wants to be recognised may say who they are, and the contact
    // address stays attached: a catalogue has to be able to reach a human about
    // traffic it did not expect.
    userAgent: custom ? `${custom} ${DEFAULT_USER_AGENT}` : DEFAULT_USER_AGENT,
    minIntervalMs: readInteger(
      env,
      "SB_MIN_INTERVAL_MS",
      MIN_ALLOWED_INTERVAL_MS,
      MIN_ALLOWED_INTERVAL_MS,
      MAX_ALLOWED_INTERVAL_MS,
    ),
    timeoutMs: readInteger(env, "SB_TIMEOUT_MS", 20_000, 1000, 120_000),
    maxRetries: readInteger(env, "SB_MAX_RETRIES", 3, 0, 8),
    cacheTtlMs: readInteger(env, "SB_CACHE_TTL_MS", 900_000, 0, 86_400_000),
    cacheMaxEntries: readInteger(env, "SB_CACHE_MAX_ENTRIES", 200, 1, 5000),
    logLevel,
  };
}
