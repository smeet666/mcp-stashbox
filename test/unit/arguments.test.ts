import { describe, it, expect } from "vitest";
import { z } from "zod";
import { strictInput } from "../../src/tools/arguments.js";

/** A declaration in the shape a search tool publishes. */
const SCENE_SHAPE = {
  query: z.string().optional(),
  title: z.string().optional(),
  performer_ids: z.array(z.string()).optional(),
  studio_ids: z.array(z.string()).optional(),
  limit: z.number().int().optional(),
  sources: z.array(z.string()).optional(),
};

const DECLARED = Object.keys(SCENE_SHAPE);

/**
 * Run an input expected to be refused and hand back the messages of the refusal.
 */
function refusal(schema: { safeParse: (value: unknown) => any }, input: unknown): string {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error("the schema accepted an input it was expected to refuse");
  }
  return result.error.issues.map((issue: { message: string }) => issue.message).join("\n");
}

describe("strictInput accepts what it declares", () => {
  it("accepts a declared argument", () => {
    const schema = strictInput(SCENE_SHAPE);
    const result = schema.safeParse({ query: "harbour lights" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("harbour lights");
    }
  });

  it("accepts every declared argument at once", () => {
    const schema = strictInput(SCENE_SHAPE);
    const result = schema.safeParse({
      query: "harbour lights",
      title: "The Midnight Garden Sessions",
      performer_ids: ["stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960"],
      studio_ids: ["fansdb:019fec3f-1bb1-7383-8782-ea0e678f6de0"],
      limit: 10,
      sources: ["stashdb"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts an input carrying none of the optional arguments", () => {
    expect(strictInput(SCENE_SHAPE).safeParse({}).success).toBe(true);
  });

  it("keeps the checks the declaration carries", () => {
    // Strictness about unknown keys leaves the declared types checked as they
    // were written: a limit is a number.
    const message = refusal(strictInput(SCENE_SHAPE), { limit: "ten" });
    expect(message.length).toBeGreaterThan(0);
  });

  it("hands back an object schema exposing the shape it was given", () => {
    const schema = strictInput(SCENE_SHAPE);
    expect(Object.keys(schema.shape).sort()).toEqual([...DECLARED].sort());
  });

  it("publishes the strictness it enforces", () => {
    // A schema announcing that it takes nothing else, and a runtime that then
    // accepts something else, would make the declaration worthless.
    const published = z.toJSONSchema(strictInput(SCENE_SHAPE)) as {
      additionalProperties?: boolean;
    };
    expect(published.additionalProperties).toBe(false);
  });
});

describe("strictInput refuses what it does not declare", () => {
  it("refuses an undeclared argument", () => {
    const result = strictInput(SCENE_SHAPE).safeParse({ country: "fr" });
    expect(result.success).toBe(false);
  });

  it("refuses an undeclared argument standing beside declared ones", () => {
    // Dropping the unknown key silently would answer a question the caller did
    // not ask and look like the narrowing had been applied.
    const message = refusal(strictInput(SCENE_SHAPE), { query: "harbour lights", country: "fr" });
    expect(message).toContain("country");
  });

  it("opens the refusal with the error code", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { country: "fr" });
    expect(message.startsWith("[invalid_input]")).toBe(true);
  });

  it("names the argument it refused", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { country: "fr" });
    expect(message).toContain("country");
  });

  it("lists what the tool takes", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { country: "fr" });
    for (const name of DECLARED) {
      expect(message).toContain(name);
    }
  });

  it("names every unknown argument when several arrive", () => {
    const message = refusal(strictInput(SCENE_SHAPE), {
      country: "fr",
      duration_minutes: 30,
      fingerprint: "abc",
    });
    expect(message).toContain("country");
    expect(message).toContain("duration_minutes");
    expect(message).toContain("fingerprint");
  });

  it("refuses an unknown argument on a shape declaring a single one", () => {
    const message = refusal(strictInput({ id: z.string() }), {
      id: "stashdb:x",
      sections: ["basic"],
    });
    expect(message.startsWith("[invalid_input]")).toBe(true);
    expect(message).toContain("sections");
    expect(message).toContain("id");
  });
});

describe("strictInput suggestions", () => {
  it("suggests the declared argument a near miss was reaching for", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { performerids: ["stashdb:abc"] });
    expect(message).toMatch(/did you mean/i);
    expect(message).toContain("performer_ids");
  });

  it("suggests a declared argument for two letters written the wrong way round", () => {
    // "titel" is "title" with one pair of letters swapped, which a distance
    // counting only insertions, deletions and substitutions scores as two edits
    // and drops below the threshold that offers a suggestion.
    const message = refusal(strictInput(SCENE_SHAPE), { titel: "The Midnight Garden Sessions" });
    expect(message).toMatch(/did you mean/i);
    expect(message).toContain("title");
  });

  it("suggests a declared argument for a doubled letter", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { querry: "harbour lights" });
    expect(message).toMatch(/did you mean/i);
    expect(message).toContain("query");
  });

  it("suggests a declared argument for a plural written where a singular is declared", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { limits: 10 });
    expect(message).toMatch(/did you mean/i);
    expect(message).toContain("limit");
  });

  it("suggests the nearest of two declared arguments that resemble each other", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { studioids: ["stashdb:abc"] });
    expect(message).toMatch(/did you mean.*studio_ids/i);
  });

  it("suggests nothing for an argument no declared one resembles", () => {
    // A suggestion that misses sends a caller to an argument answering a
    // different question, which costs more than no suggestion at all.
    const message = refusal(strictInput(SCENE_SHAPE), { astrophysics: true });
    expect(message).not.toMatch(/did you mean/i);
    expect(message).toContain("astrophysics");
  });

  it("suggests nothing for a long unrelated argument", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { colour_temperature_kelvin: 5600 });
    expect(message).not.toMatch(/did you mean/i);
  });

  it("still lists what the tool takes when it suggests nothing", () => {
    const message = refusal(strictInput(SCENE_SHAPE), { astrophysics: true });
    for (const name of DECLARED) {
      expect(message).toContain(name);
    }
  });
});
