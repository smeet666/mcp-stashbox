/**
 * What a value from a catalogue is allowed to become.
 *
 * Every rule here exists because a catalogue publishes something its data does
 * not carry, and repeating it unchanged would turn a gap into a claim.
 */

export type DatePrecision = "day" | "month" | "year";

export interface ReadDate {
  /** The date exactly as published. */
  value: string;
  precision: DatePrecision;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const YEAR = /^\d{4}$/;

/**
 * Read a catalogue date.
 *
 * Dates are stored as text and a cataloguer enters what they knew, so a record
 * holds a full day, a month or a bare year. Rendering a bare year as a day would
 * claim a precision nobody entered.
 */
export function readDate(raw: string | null | undefined): ReadDate | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (value === "") return null;
  if (DAY.test(value) && namesARealDay(value)) return { value, precision: "day" };
  if (MONTH.test(value) && namesARealMonth(value)) return { value, precision: "month" };
  if (YEAR.test(value)) return { value, precision: "year" };
  return null;
}

/**
 * A date shaped like a date still has to name one.
 *
 * The catalogue stores text, so a record can carry the thirty-first of April or
 * a thirteenth month. Handing either back with a precision would put a day that
 * never happened in front of a reader as a fact.
 */
function namesARealMonth(value: string): boolean {
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function namesARealDay(value: string): boolean {
  if (!namesARealMonth(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (day < 1) return false;
  // Day zero of the following month is the last day of this one.
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A quantity on a scale that cannot hold zero.
 *
 * A merged record publishes a height of zero, which no person has. Reading it as
 * a measurement would state a fact about a body from a field that was emptied.
 */
export function positiveOrNull(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export type RecordStatus = "established" | "deleted" | "merged";

/**
 * What a record is.
 *
 * A merged record is flagged deleted and carries its successor, so the successor
 * is what separates a record folded into another from one withdrawn outright.
 */
export function readStatus(
  deleted: boolean | null | undefined,
  mergedIntoId: string | null | undefined,
): RecordStatus {
  if (deleted !== true) return "established";
  return mergedIntoId ? "merged" : "deleted";
}

/**
 * Whether a fingerprint is disputed by the people who entered it.
 *
 * An instance that records no disputes yields null. A match nobody disputed and
 * a match on a catalogue that counts no disputes are different things, and
 * rendering the second as `false` would state an agreement nobody expressed.
 */
export function readContested(
  submissions: number | null | undefined,
  reports: number | null | undefined,
): boolean | null {
  if (reports === null || reports === undefined) return null;
  // Contesting takes at least one person contesting. Comparing the two counts
  // alone calls a fingerprint nobody has touched doubtful, which is a reading of
  // two zeroes rather than a statement anybody made.
  if (reports <= 0) return false;
  // A catalogue that reports against a fingerprint without saying how many
  // vouched for it has still recorded a contest.
  if (submissions === null || submissions === undefined) return true;
  return reports >= submissions;
}

/** The two openings this server writes for a line a reader is meant to trust. */
const SERVER_OWN_OPENING = /^\s*(Note|Source):/;

/**
 * Shift a line of fetched text that opens exactly the way this server opens its
 * own qualifications.
 *
 * This matches the one spelling the server writes, so published text reading
 * `Notes: a list` or `note the date` is returned as it was published. Text that
 * runs to several lines is guarded by being indented whole, which is what makes
 * a narrow match here safe.
 */
export function indentMarkerLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (SERVER_OWN_OPENING.test(line) ? `  ${line}` : line))
    .join("\n");
}

/**
 * A block of a catalogue's own prose, made unable to forge a line of this
 * server's.
 *
 * Every line is shifted, whatever it says. Recognising the openings this server
 * writes would leave the question of which spellings count, and a block that is
 * indented throughout raises no such question: no line of it can begin where a
 * line of the server's begins.
 */
export function indentBlock(text: string): string {
  return text
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

/** A number the catalogue may publish as text, or omit. */
export function readInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Text a catalogue publishes, with an empty string read as the absence it is. */
export function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : value;
}
