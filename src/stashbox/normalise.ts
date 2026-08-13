/**
 * Reading what a catalogue published into what this client can state.
 *
 * One rule governs every function here: the server never states anything the
 * data does not carry. A value that cannot be read is an absence, and it is
 * returned as `null` so a caller has to face it, and a value that is read keeps
 * the precision, the sign and the spelling it was published with.
 */

export type DatePrecision = "day" | "month" | "year";

export interface ReadDate {
  /** The text the catalogue published, unchanged. */
  value: string;
  precision: DatePrecision;
}

export type RecordStatus = "established" | "merged" | "deleted";

const YEAR = /^(\d{4})$/;
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const YEAR_MONTH_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** How many days a month holds, the second entry answered by the year itself. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/**
 * A date in the three shapes a catalogue stores, carrying the precision it was
 * entered at. A bare year is a year: rendering it as the first of January would
 * put a day in front of a reader that nobody entered, so the precision travels
 * with the value instead of being inferred by whoever prints it.
 *
 * Anything else is an absence. A value shaped like a date that names no day on
 * a calendar, the 31st of April among them, is a value the catalogue cannot
 * have meant, and a value written in another order names a date whose year
 * could only be guessed.
 */
export function readDate(value: string | null | undefined): ReadDate | null {
  if (typeof value !== "string" || value === "") return null;

  const day = YEAR_MONTH_DAY.exec(value);
  if (day) {
    const year = Number(day[1]);
    const month = Number(day[2]);
    const date = Number(day[3]);
    if (month < 1 || month > 12) return null;
    if (date < 1 || date > daysInMonth(year, month)) return null;
    return { value, precision: "day" };
  }

  const month = YEAR_MONTH.exec(value);
  if (month) {
    const number = Number(month[2]);
    if (number < 1 || number > 12) return null;
    return { value, precision: "month" };
  }

  if (YEAR.test(value)) return { value, precision: "year" };

  return null;
}

/**
 * A quantity that counts something, or the absence it stands for. Zero and the
 * negatives are absences here: a merged record publishes a height of zero, and
 * no person is nought centimetres tall, so passing it through would put a
 * measurement in front of a reader that nobody took.
 */
export function positiveOrNull(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 0 ? value : null;
}

/**
 * Where a record stands in its catalogue. The merge marker is the deleted flag:
 * a successor named on a live record leaves the record where it is, and a
 * deleted record naming a successor is answered with that successor, since
 * `not_found` would deny a record that exists under another name.
 */
export function readStatus(
  deleted: boolean | null | undefined,
  successor: string | null | undefined,
): RecordStatus {
  if (deleted !== true) return "established";
  return typeof successor === "string" && successor !== "" ? "merged" : "deleted";
}

/**
 * Whether a fingerprint is disputed, read from how often it was submitted and
 * how often it was reported.
 *
 * An instance that publishes no report count has recorded nothing either way,
 * so the answer is `null`: reading that silence as `false` would state an
 * agreement nobody expressed. Contesting takes at least one person contesting,
 * which is why a fingerprint nobody has touched is uncontested. A count of
 * reports without a count of submissions is still a contest that was recorded.
 */
export function readContested(
  submissions: number | null | undefined,
  reports: number | null | undefined,
): boolean | null {
  if (typeof reports !== "number") return null;
  if (reports <= 0) return false;
  if (typeof submissions !== "number") return true;
  return reports >= submissions;
}

/**
 * A line whose first non-space characters open the way this server opens a line
 * of its own.
 *
 * The set is every opening a rendered answer writes at column zero: the
 * qualifications, the address a record was read from, the block naming each
 * catalogue, the moment of the reading, and the labelled lines a record is made
 * of. A list of the spellings somebody thought of leaves the next one open, so
 * this reads the shape instead: a word or two, then a colon, is how every line
 * of ours begins, and a leading dash is how every row of ours begins.
 */
const MARKER_LINE = /^ *(?:[A-Z][A-Za-z]*(?: [a-z]+){0,3}:|- |Read from )/;

/**
 * Shifts the lines of published text that open where a line this server writes
 * opens.
 *
 * Text a catalogue published reaches a reader inside an answer this server
 * composes, and a description opening a line with `Note:` forges a line the
 * server appears to have written. Two spaces are enough to tell them apart, and
 * every other byte of the text is left where it was, including the line count
 * and the blank lines.
 *
 * A value placed inside a line of ours is flattened rather than shifted, since
 * a shifted line is still a line the reader did not expect there. This guard is
 * for the one thing published as a block of its own.
 */
export function indentMarkerLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (MARKER_LINE.test(line) ? `  ${line}` : line))
    .join("\n");
}
