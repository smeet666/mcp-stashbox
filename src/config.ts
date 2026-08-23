/**
 * What the environment is allowed to say, and what it can never say.
 *
 * Two rules govern this file. A value this client cannot read is refused and
 * named on stderr, since silently falling back would run the server on a
 * setting nobody chose. And the pacing floor cannot be lowered by anyone: these
 * catalogues are free to use, so the configuration may ask this client to be
 * slower and never to be faster.
 *
 * Nothing here writes to stdout. That channel carries the protocol, and a line
 * of ours on it would be read as a message.
 */

import { INSTANCES, type InstanceId } from "./stashbox/instances.js";
import { VERSION } from "./version.js";

/** The floor no configuration lowers, in milliseconds between two requests. */
export const MIN_ALLOWED_INTERVAL_MS = 1000;

/** The ceiling past which a setting is a mistake rather than a courtesy. */
export const MAX_ALLOWED_INTERVAL_MS = 60_000;

export const LOG_LEVELS = ["error", "info", "debug"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Where this server says what it is doing, which is never stdout.
 *
 * A warning is something a reader should see without asking for detail, so it
 * carries its own method. It is not a level the environment can select: an
 * operator chooses how much they want, and a warning belongs to whatever they
 * chose above the quietest setting.
 */
export interface Logger {
  error: (message: string) => void;
  warn: (message: string) => void;
  info: (message: string) => void;
  debug: (message: string) => void;
}

export interface Config {
  keys: Partial<Record<InstanceId, string>>;
  minIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  userAgent: string;
  logLevel: LogLevel;
}

/**
 * How this client names itself, carrying where to reach a person.
 *
 * A catalogue reading its logs can tell what asked and who to write to. A
 * caller may put their own name in front of it; they cannot replace it.
 */
export const DEFAULT_USER_AGENT = `mcp-stashbox/${VERSION} (+https://github.com/smeet666/mcp-stashbox)`;

const DEFAULTS = {
  minIntervalMs: MIN_ALLOWED_INTERVAL_MS,
  timeoutMs: 20_000,
  maxRetries: 3,
  cacheTtlMs: 300_000,
  cacheMaxEntries: 500,
} as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const refused: string[] = [];

  const keys: Partial<Record<InstanceId, string>> = {};
  for (const spec of INSTANCES) {
    const written = env[spec.envVar]?.trim();
    // A variable set to nothing is a variable nobody set. Holding an empty key
    // would send a request that fails on every record for one missing setting.
    if (written) {
      keys[spec.id] = written;
    }
  }

  const bounded = (name: string, fallback: number, low: number, high: number): number => {
    const written = env[name]?.trim();
    if (written === undefined || written === "") {
      return fallback;
    }
    const value = Number(written);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < low || value > high) {
      refused.push(name);
      return fallback;
    }
    return value;
  };

  const config: Config = {
    keys,
    minIntervalMs: bounded(
      "SB_MIN_INTERVAL_MS",
      DEFAULTS.minIntervalMs,
      MIN_ALLOWED_INTERVAL_MS,
      MAX_ALLOWED_INTERVAL_MS,
    ),
    timeoutMs: bounded("SB_TIMEOUT_MS", DEFAULTS.timeoutMs, 1, 600_000),
    maxRetries: bounded("SB_MAX_RETRIES", DEFAULTS.maxRetries, 0, 10),
    cacheTtlMs: bounded("SB_CACHE_TTL_MS", DEFAULTS.cacheTtlMs, 0, 86_400_000),
    cacheMaxEntries: bounded("SB_CACHE_MAX_ENTRIES", DEFAULTS.cacheMaxEntries, 1, 100_000),
    userAgent: readUserAgent(env.SB_USER_AGENT),
    logLevel: readLogLevel(env.SB_LOG_LEVEL),
  };

  // Named on stderr, since a value quietly replaced is a server running on a
  // setting its operator believes they chose.
  for (const name of refused) {
    process.stderr.write(
      `mcp-stashbox: ${name} was not a value this client reads, so its default stands.\n`,
    );
  }

  return config;
}

/** A caller's own name in front of this client's, which always survives. */
function readUserAgent(written: string | undefined): string {
  const own = written?.trim();
  return own ? `${own} ${DEFAULT_USER_AGENT}` : DEFAULT_USER_AGENT;
}

function readLogLevel(written: string | undefined): LogLevel {
  const level = written?.trim() as LogLevel | undefined;
  return level !== undefined && (LOG_LEVELS as readonly string[]).includes(level) ? level : "error";
}

/** A logger that writes to stderr, since stdout carries the protocol. */
export function createLogger(level: LogLevel): Logger {
  const at = LOG_LEVELS.indexOf(level);
  const write = (want: LogLevel, message: string) => {
    if (LOG_LEVELS.indexOf(want) <= at) {
      process.stderr.write(`mcp-stashbox: ${message}\n`);
    }
  };
  return {
    error: (message) => write("error", message),
    warn: (message) => write("info", message),
    info: (message) => write("info", message),
    debug: (message) => write("debug", message),
  };
}
