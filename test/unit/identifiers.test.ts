import { describe, it, expect } from "vitest";
import { parseId, formatId, isUuid } from "../../src/stashbox/identifiers.js";
import { INSTANCES, type InstanceId } from "../../src/stashbox/instances.js";
import { StashboxError } from "../../src/errors.js";

/** Two identifiers the catalogue actually mints: one version 4, one version 7. */
const UUID_V4 = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const UUID_V7 = "019fec3f-1bb1-7383-8782-ea0e678f6de0";

const ALL: readonly InstanceId[] = ["stashdb", "tpdb", "fansdb", "pmv", "javstash"];

/** Run a call expected to fail and hand back the error it threw. */
function capture(run: () => unknown): StashboxError {
  try {
    run();
  } catch (error) {
    if (error instanceof StashboxError) {
      return error;
    }
    throw error;
  }
  throw new Error("the call returned instead of throwing");
}

/**
 * What a caller reads when the call is refused. A hint is part of the refusal,
 * so an assertion about what the refusal says covers both halves of it.
 */
function refusalText(error: StashboxError): string {
  return `${error.message} ${error.details.hint ?? ""}`;
}

describe("parseId", () => {
  it("reads a namespaced identifier as the instance it names", () => {
    expect(parseId(`stashdb:${UUID_V4}`, ALL)).toEqual({
      instance: "stashdb",
      uuid: UUID_V4,
    });
  });

  it("reads a namespaced identifier for every instance in the registry", () => {
    for (const spec of INSTANCES) {
      expect(parseId(`${spec.id}:${UUID_V7}`, ALL)).toEqual({
        instance: spec.id,
        uuid: UUID_V7,
      });
    }
  });

  it("reads a bare uuid as the single configured instance", () => {
    expect(parseId(UUID_V4, ["fansdb"])).toEqual({
      instance: "fansdb",
      uuid: UUID_V4,
    });
  });

  it("refuses a bare uuid when several instances could have minted it", () => {
    // The same uuid exists on more than one instance and means different things
    // there, so guessing an owner would attach the answer to the wrong record.
    const error = capture(() => parseId(UUID_V4, ["stashdb", "tpdb"]));
    expect(error.code).toBe("invalid_input");
    expect(refusalText(error)).toContain("stashdb");
    expect(refusalText(error)).toContain("tpdb");
  });

  it("says why a bare uuid cannot be resolved, so the caller can namespace it", () => {
    // The refusal has to state that several instances are configured and any of
    // them could hold that uuid, since a caller told only that the identifier
    // was refused would retry the same string.
    const error = capture(() => parseId(UUID_V4, ["stashdb", "tpdb"]));
    expect(refusalText(error)).toMatch(/ambiguous|could have minted|more than one|several/i);
  });

  it("states the ambiguity in terms of the instances configured", () => {
    const error = capture(() => parseId(UUID_V7, ALL));
    expect(error.code).toBe("invalid_input");
    for (const id of ALL) {
      expect(refusalText(error)).toContain(id);
    }
  });

  it("names only the configured instances when a bare uuid is refused", () => {
    // An instance the caller holds no key for cannot answer, so proposing it as
    // a prefix would send the caller to a lookup that has no key behind it.
    const error = capture(() => parseId(UUID_V4, ["stashdb", "tpdb"]));
    expect(refusalText(error)).not.toContain("javstash");
  });

  it("refuses a bare uuid when no instance is configured", () => {
    // With no key anywhere, a bare uuid names nothing, and answering an absence
    // would report a record as missing from instances nobody could ask.
    const error = capture(() => parseId(UUID_V4, []));
    expect(error.code).toBe("invalid_input");
  });

  it("refuses an unknown prefix and names the prefixes it knows", () => {
    const error = capture(() => parseId(`stashbox:${UUID_V4}`, ALL));
    expect(error.code).toBe("invalid_input");
    for (const spec of INSTANCES) {
      expect(refusalText(error)).toContain(spec.id);
    }
  });

  it("refuses a prefix that resembles a known one", () => {
    const error = capture(() => parseId(`stash:${UUID_V4}`, ALL));
    expect(error.code).toBe("invalid_input");
  });

  it("refuses a namespaced identifier whose uuid is malformed", () => {
    const error = capture(() => parseId("stashdb:not-a-uuid", ALL));
    expect(error.code).toBe("invalid_input");
  });

  it("refuses a uuid missing a group", () => {
    const error = capture(() => parseId("stashdb:94ef9c17-82c6-48b0-8dcc", ALL));
    expect(error.code).toBe("invalid_input");
  });

  it("refuses a uuid carrying a group of the wrong length", () => {
    const error = capture(() => parseId("stashdb:94ef9c17-82c6-48b0-8dcc-063b6923196", ALL));
    expect(error.code).toBe("invalid_input");
  });

  it("refuses a uuid carrying a non-hexadecimal character", () => {
    const error = capture(() => parseId("stashdb:94ef9c17-82c6-48b0-8dcc-063b6923196z", ALL));
    expect(error.code).toBe("invalid_input");
  });

  it("refuses a bare string that is not a uuid, with one instance configured", () => {
    const error = capture(() => parseId("12345", ["stashdb"]));
    expect(error.code).toBe("invalid_input");
  });

  it("refuses an empty identifier", () => {
    const error = capture(() => parseId("", ["stashdb"]));
    expect(error.code).toBe("invalid_input");
  });

  it("accepts a version 4 uuid", () => {
    expect(parseId(`javstash:${UUID_V4}`, ALL).uuid).toBe(UUID_V4);
  });

  it("accepts a version 7 uuid", () => {
    // The catalogue mints both versions, so pinning the version digit to 4 would
    // reject identifiers the instances hand out.
    expect(parseId(`javstash:${UUID_V7}`, ALL).uuid).toBe(UUID_V7);
  });

  it("accepts a bare version 7 uuid with one instance configured", () => {
    expect(parseId(UUID_V7, ["pmv"])).toEqual({ instance: "pmv", uuid: UUID_V7 });
  });

  it("accepts a uuid written in upper case", () => {
    const parsed = parseId(`stashdb:${UUID_V4.toUpperCase()}`, ALL);
    expect(parsed.instance).toBe("stashdb");
    expect(parsed.uuid.toLowerCase()).toBe(UUID_V4);
  });

  it("accepts a uuid written in mixed case", () => {
    const mixed = "94EF9c17-82C6-48b0-8DCC-063b69231960";
    const parsed = parseId(mixed, ["fansdb"]);
    expect(parsed.instance).toBe("fansdb");
    expect(parsed.uuid.toLowerCase()).toBe(UUID_V4);
  });
});

describe("isUuid", () => {
  it("accepts a version 4 uuid", () => {
    expect(isUuid(UUID_V4)).toBe(true);
  });

  it("accepts a version 7 uuid", () => {
    expect(isUuid(UUID_V7)).toBe(true);
  });

  it("accepts a uuid in upper case", () => {
    expect(isUuid(UUID_V4.toUpperCase())).toBe(true);
  });

  it("rejects a string of the right length that is not hexadecimal", () => {
    expect(isUuid("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz")).toBe(false);
  });

  it("rejects a uuid without its separators", () => {
    expect(isUuid(UUID_V4.replace(/-/g, ""))).toBe(false);
  });

  it("rejects a namespaced identifier", () => {
    expect(isUuid(`stashdb:${UUID_V4}`)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isUuid("")).toBe(false);
  });
});

describe("formatId", () => {
  it("joins an instance and a uuid with a colon", () => {
    expect(formatId("stashdb", UUID_V4)).toBe(`stashdb:${UUID_V4}`);
  });

  it("round-trips through parseId for every instance in the registry", () => {
    for (const spec of INSTANCES) {
      const formatted = formatId(spec.id, UUID_V7);
      expect(parseId(formatted, ALL)).toEqual({ instance: spec.id, uuid: UUID_V7 });
    }
  });

  it("round-trips a parsed identifier back to the string it came from", () => {
    const raw = `pmv:${UUID_V4}`;
    const parsed = parseId(raw, ALL);
    expect(formatId(parsed.instance, parsed.uuid)).toBe(raw);
  });

  it("round-trips a bare uuid into the namespaced form of its single instance", () => {
    const parsed = parseId(UUID_V4, ["javstash"]);
    expect(formatId(parsed.instance, parsed.uuid)).toBe(`javstash:${UUID_V4}`);
  });
});
