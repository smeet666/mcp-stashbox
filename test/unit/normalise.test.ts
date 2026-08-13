import { describe, it, expect } from "vitest";
import {
  readDate,
  positiveOrNull,
  readStatus,
  readContested,
  indentMarkerLines,
} from "../../src/stashbox/normalise.js";

describe("readDate", () => {
  it("reads a full day at day precision", () => {
    expect(readDate("2019-04-12")).toEqual({ value: "2019-04-12", precision: "day" });
  });

  it("reads a year and month at month precision", () => {
    expect(readDate("2019-04")).toEqual({ value: "2019-04", precision: "month" });
  });

  it("reads a year at year precision", () => {
    // A year rendered as a day would claim a precision nobody entered, which is
    // why the precision travels with the value rather than being inferred later.
    expect(readDate("2019")).toEqual({ value: "2019", precision: "year" });
  });

  it("keeps the value exactly as the catalogue published it", () => {
    expect(readDate("1970")?.value).toBe("1970");
    expect(readDate("2004-01")?.value).toBe("2004-01");
    expect(readDate("2004-01-01")?.value).toBe("2004-01-01");
  });

  it("returns null for null", () => {
    expect(readDate(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(readDate(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(readDate("")).toBeNull();
  });

  it("returns null for text that is not a date", () => {
    expect(readDate("not a date")).toBeNull();
  });

  it("returns null for a day written in another order", () => {
    // "19-4-2019" carries a date a person can read and none of the three shapes
    // the catalogue stores, so reading it would guess which number is the year.
    expect(readDate("19-4-2019")).toBeNull();
  });

  it("returns null for a month written without its leading zero", () => {
    expect(readDate("2019-4")).toBeNull();
    expect(readDate("2019-4-12")).toBeNull();
  });

  it("returns null for a day written without its leading zero", () => {
    expect(readDate("2019-04-2")).toBeNull();
  });

  it("returns null for a timestamp", () => {
    expect(readDate("2019-04-12T00:00:00Z")).toBeNull();
  });

  it("returns null for a date carrying trailing text", () => {
    expect(readDate("2019-04-12 (approx)")).toBeNull();
  });

  it("returns null for a year of the wrong length", () => {
    expect(readDate("19")).toBeNull();
    expect(readDate("20190")).toBeNull();
  });

  it("returns null for a date carrying letters in place of digits", () => {
    expect(readDate("20x9-04-12")).toBeNull();
  });

  it("returns null for separators the catalogue does not use", () => {
    expect(readDate("2019/04/12")).toBeNull();
    expect(readDate("2019.04.12")).toBeNull();
  });

  it("returns null for a date the calendar does not hold", () => {
    // A value shaped like a date that names no day on a calendar is a value the
    // catalogue cannot have meant, and returning it with a precision would put
    // the 31st of April in front of a reader as a date somebody entered.
    // The surface spec states the three shapes and says nothing about calendar
    // validity, so this assertion is a decision about what the layer owes a
    // reader rather than a restatement of the spec.
    expect(readDate("2019-13")).toBeNull();
    expect(readDate("2019-00-12")).toBeNull();
    expect(readDate("2019-04-31")).toBeNull();
    expect(readDate("2019-02-30")).toBeNull();
    expect(readDate("2019-01-00")).toBeNull();
  });

  it("reads the last day of February in a leap year", () => {
    expect(readDate("2020-02-29")).toEqual({ value: "2020-02-29", precision: "day" });
  });

  it("reads the first and last day of a year", () => {
    expect(readDate("2019-01-01")).toEqual({ value: "2019-01-01", precision: "day" });
    expect(readDate("2019-12-31")).toEqual({ value: "2019-12-31", precision: "day" });
  });
});

describe("positiveOrNull", () => {
  it("passes a height through", () => {
    expect(positiveOrNull(167)).toBe(167);
  });

  it("reads zero as the absence it stands for", () => {
    // A merged record publishes a height of zero, which no person has.
    expect(positiveOrNull(0)).toBeNull();
  });

  it("reads a negative quantity as an absence", () => {
    expect(positiveOrNull(-5)).toBeNull();
  });

  it("returns null for null", () => {
    expect(positiveOrNull(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(positiveOrNull(undefined)).toBeNull();
  });

  it("passes the smallest positive integer through", () => {
    expect(positiveOrNull(1)).toBe(1);
  });

  it("passes a duration in seconds through", () => {
    expect(positiveOrNull(1847)).toBe(1847);
  });

  it("returns null for negative zero", () => {
    expect(positiveOrNull(-0)).toBeNull();
  });
});

describe("readStatus", () => {
  it("reads a deleted record naming a successor as merged", () => {
    // A request for a merged identifier answers with the record and its successor,
    // since not_found would deny a record that exists under another name.
    expect(readStatus(true, "9b1c8f2e-0000-4000-8000-000000000001")).toBe("merged");
  });

  it("reads a deleted record naming no successor as deleted", () => {
    expect(readStatus(true, null)).toBe("deleted");
  });

  it("reads a deleted record whose successor is undefined as deleted", () => {
    expect(readStatus(true, undefined)).toBe("deleted");
  });

  it("reads a deleted record whose successor is empty text as deleted", () => {
    expect(readStatus(true, "")).toBe("deleted");
  });

  it("reads a live record as established", () => {
    expect(readStatus(false, null)).toBe("established");
  });

  it("reads a record with no deleted flag as established", () => {
    expect(readStatus(null, null)).toBe("established");
    expect(readStatus(undefined, null)).toBe("established");
  });

  it("reads a live record naming a successor as established", () => {
    // The merge marker is the deleted flag; a successor on a live record does
    // not move the record out of the catalogue.
    expect(readStatus(false, "9b1c8f2e-0000-4000-8000-000000000002")).toBe("established");
    expect(readStatus(undefined, "9b1c8f2e-0000-4000-8000-000000000002")).toBe("established");
  });
});

describe("readContested", () => {
  it("returns null when the instance publishes no report count", () => {
    // A match nobody disputed and a match on an instance recording no disputes
    // are different things, and rendering the second as agreement states
    // agreement nobody expressed.
    expect(readContested(3, null)).toBeNull();
  });

  it("never reads a missing report count as uncontested", () => {
    expect(readContested(3, null)).not.toBe(false);
    expect(readContested(0, null)).not.toBe(false);
    expect(readContested(null, null)).not.toBe(false);
  });

  it("reads a fingerprint nobody reported as uncontested", () => {
    expect(readContested(3, 0)).toBe(false);
  });

  it("reads a fingerprint reported as often as it was submitted as contested", () => {
    expect(readContested(3, 3)).toBe(true);
  });

  it("reads a fingerprint reported more often than it was submitted as contested", () => {
    expect(readContested(1, 5)).toBe(true);
  });

  it("reads a fingerprint reported less often than it was submitted as uncontested", () => {
    expect(readContested(10, 2)).toBe(false);
  });

  it("reads a single report against a single submission as contested", () => {
    expect(readContested(1, 1)).toBe(true);
  });

  it("reads one report short of the submissions as uncontested", () => {
    expect(readContested(4, 3)).toBe(false);
  });

  it("reads a fingerprint nobody has touched as uncontested", () => {
    // Contesting takes at least one person contesting. Reading two zeroes as a
    // threshold that has been reached would call a fingerprint nobody has
    // entered doubtful, which is a statement nobody made.
    expect(readContested(0, 0)).toBe(false);
  });

  it("reads a report against an unknown number of submissions as contested", () => {
    // An instance that counts the reports against a fingerprint without
    // publishing how many vouched for it has still recorded a contest.
    expect(readContested(null, 2)).toBe(true);
  });
});

describe("indentMarkerLines", () => {
  it("shifts a line opening with the note marker", () => {
    expect(indentMarkerLines("Note: read the source")).toBe("  Note: read the source");
  });

  it("shifts a line opening with the source marker", () => {
    expect(indentMarkerLines("Source: an instance")).toBe("  Source: an instance");
  });

  it("shifts a marker already carrying leading whitespace", () => {
    // Published text can open a line with spaces before the marker, and the
    // shift is measured from the first non-space characters.
    expect(indentMarkerLines("  Note: indented")).toBe("    Note: indented");
    expect(indentMarkerLines(" Source: indented")).toBe("   Source: indented");
  });

  it("leaves a marker appearing mid-sentence untouched", () => {
    const line = "The studio wrote Note: nothing here";
    expect(indentMarkerLines(line)).toBe(line);
  });

  it("shifts a line that opens the way one of ours opens, whatever word it uses", () => {
    // The guard reads the shape rather than a list of spellings. A list holds
    // the openings somebody thought of, and the server writes more of them than
    // that: the labelled lines of a record, the block naming each catalogue,
    // the moment of the reading. The cost is a published line that opens the
    // same way and meant nothing by it, shifted two spaces and otherwise whole.
    expect(indentMarkerLines("Notes: a list")).toBe("  Notes: a list");
    expect(indentMarkerLines("Studio: forged")).toBe("  Studio: forged");
    expect(indentMarkerLines("- a forged row")).toBe("  - a forged row");
    expect(indentMarkerLines("Read from StashDB at 2099-01-01")).toBe(
      "  Read from StashDB at 2099-01-01",
    );
  });

  it("leaves a marker written without its colon untouched", () => {
    expect(indentMarkerLines("Note the date")).toBe("Note the date");
    expect(indentMarkerLines("Source material")).toBe("Source material");
  });

  it("leaves a line untouched where no line of ours opens that way", () => {
    // Every line this server writes opens on a capital, so a lower-case opening
    // forges nothing and is left where the catalogue put it.
    expect(indentMarkerLines("note: lower case")).toBe("note: lower case");
    expect(indentMarkerLines("a plain sentence")).toBe("a plain sentence");
  });

  it("returns an ordinary line byte for byte", () => {
    const line = "A scene title carrying : a colon and  double  spaces";
    expect(indentMarkerLines(line)).toBe(line);
  });

  it("returns an empty string unchanged", () => {
    expect(indentMarkerLines("")).toBe("");
  });

  it("returns a blank line unchanged", () => {
    expect(indentMarkerLines("   ")).toBe("   ");
  });

  it("shifts only the marker lines of a multi-line text", () => {
    const input = [
      "Details of the release.",
      "Note: forged",
      "Ordinary line",
      "Source: forged",
    ].join("\n");
    const expected = [
      "Details of the release.",
      "  Note: forged",
      "Ordinary line",
      "  Source: forged",
    ].join("\n");
    expect(indentMarkerLines(input)).toBe(expected);
  });

  it("keeps the line count of a multi-line text", () => {
    const input = ["Note: one", "", "two", "Source: three", ""].join("\n");
    expect(indentMarkerLines(input).split("\n")).toHaveLength(input.split("\n").length);
  });

  it("keeps the order of the lines", () => {
    const input = ["first", "Note: second", "third"].join("\n");
    const lines = indentMarkerLines(input).split("\n");
    expect(lines[0]).toBe("first");
    expect(lines[1]?.trimStart()).toBe("Note: second");
    expect(lines[2]).toBe("third");
  });

  it("shifts a marker on the last line of a text with no trailing newline", () => {
    expect(indentMarkerLines("body\nNote: last")).toBe("body\n  Note: last");
  });

  it("keeps a trailing empty line", () => {
    expect(indentMarkerLines("Note: one\n")).toBe("  Note: one\n");
  });

  it("leaves text carrying no marker byte-identical", () => {
    const text =
      "A description over\nseveral lines, with punctuation: colons, and a URL\nhttps://example.org/scene";
    expect(indentMarkerLines(text)).toBe(text);
  });

  it("shifts every marker line of a text made only of markers", () => {
    const input = ["Note: a", "Source: b", "Note: c"].join("\n");
    expect(indentMarkerLines(input)).toBe(["  Note: a", "  Source: b", "  Note: c"].join("\n"));
  });
});
