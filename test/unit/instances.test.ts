import { describe, it, expect } from "vitest";
import {
  INSTANCES,
  instanceById,
  supports,
  type Capability,
  type InstanceId,
  type InstanceSpec,
} from "../../src/stashbox/instances.js";

const ALL_CAPABILITIES: readonly Capability[] = [
  "search_scenes",
  "search_performers",
  "get_scene",
  "get_performer",
  "find_by_fingerprint",
  "site_categories",
  "fingerprint_reports",
];

/** What the registry must publish for each instance, measured on the instances themselves. */
const EXPECTED: Record<
  InstanceId,
  { name: string; endpoint: string; webBase: string; envVar: string; dialect: "strict" | "loose" }
> = {
  stashdb: {
    name: "StashDB",
    endpoint: "https://stashdb.org/graphql",
    webBase: "https://stashdb.org",
    envVar: "STASHBOX_STASHDB_KEY",
    dialect: "strict",
  },
  tpdb: {
    name: "ThePornDB",
    endpoint: "https://theporndb.net/graphql",
    webBase: "https://theporndb.net",
    envVar: "STASHBOX_TPDB_KEY",
    dialect: "loose",
  },
  fansdb: {
    name: "FansDB",
    endpoint: "https://fansdb.cc/graphql",
    webBase: "https://fansdb.cc",
    envVar: "STASHBOX_FANSDB_KEY",
    dialect: "strict",
  },
  pmv: {
    name: "PMV Stash",
    endpoint: "https://pmvstash.org/graphql",
    webBase: "https://pmvstash.org",
    envVar: "STASHBOX_PMV_KEY",
    dialect: "strict",
  },
  javstash: {
    name: "JAVStash",
    endpoint: "https://javstash.org/graphql",
    webBase: "https://javstash.org",
    envVar: "STASHBOX_JAVSTASH_KEY",
    dialect: "strict",
  },
};

/** The four instances running the published software. */
const PUBLISHED_SOFTWARE: readonly InstanceId[] = ["stashdb", "fansdb", "pmv", "javstash"];

function spec(id: InstanceId): InstanceSpec {
  const found = instanceById(id);
  if (!found) throw new Error(`the registry declares no instance ${id}`);
  return found;
}

describe("INSTANCES", () => {
  it("declares five instances", () => {
    expect(INSTANCES).toHaveLength(5);
  });

  it("declares each instance exactly once", () => {
    const ids = INSTANCES.map((instance) => instance.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares the five ids the server reads", () => {
    expect(INSTANCES.map((instance) => instance.id).sort()).toEqual(
      ["fansdb", "javstash", "pmv", "stashdb", "tpdb"].sort(),
    );
  });

  for (const id of Object.keys(EXPECTED) as InstanceId[]) {
    const expected = EXPECTED[id];

    describe(id, () => {
      it("carries the name the instance calls itself", () => {
        expect(spec(id).name).toBe(expected.name);
      });

      it("carries its GraphQL endpoint", () => {
        expect(spec(id).endpoint).toBe(expected.endpoint);
      });

      it("carries the web base a source_url is built from", () => {
        expect(spec(id).webBase).toBe(expected.webBase);
      });

      it("carries the env var holding its key", () => {
        expect(spec(id).envVar).toBe(expected.envVar);
      });

      it("carries its dialect", () => {
        expect(spec(id).dialect).toBe(expected.dialect);
      });
    });
  }

  it("gives every web base an address with no trailing slash, so a path appends cleanly", () => {
    for (const instance of INSTANCES) {
      expect(instance.webBase.endsWith("/")).toBe(false);
    }
  });

  it("gives every endpoint the graphql route on its own host", () => {
    for (const instance of INSTANCES) {
      expect(instance.endpoint).toBe(`${instance.webBase}/graphql`);
    }
  });

  it("gives every instance a distinct env var", () => {
    const vars = INSTANCES.map((instance) => instance.envVar);
    expect(new Set(vars).size).toBe(vars.length);
  });
});

describe("dialects", () => {
  it("marks ThePornDB as the loose dialect", () => {
    // Its fingerprint algorithm is free text and its scene query requires page,
    // sort and direction, so a request built for the published software is refused.
    expect(spec("tpdb").dialect).toBe("loose");
  });

  it("marks the four instances running the published software as strict", () => {
    for (const id of PUBLISHED_SOFTWARE) {
      expect(spec(id).dialect).toBe("strict");
    }
  });

  it("declares exactly one loose instance", () => {
    expect(INSTANCES.filter((instance) => instance.dialect === "loose")).toHaveLength(1);
  });
});

describe("capabilities", () => {
  it("declares every capability on each instance running the published software", () => {
    for (const id of PUBLISHED_SOFTWARE) {
      for (const capability of ALL_CAPABILITIES) {
        expect(supports(spec(id), capability)).toBe(true);
      }
    }
  });

  it("declares no plural scene search on ThePornDB", () => {
    expect(supports(spec("tpdb"), "search_scenes")).toBe(false);
  });

  it("declares no plural performer search on ThePornDB", () => {
    expect(supports(spec("tpdb"), "search_performers")).toBe(false);
  });

  it("declares no site categories on ThePornDB", () => {
    // It publishes no table of the sites it knows, so a link from it carries a
    // site and no category rather than borrowing a category from a neighbour.
    expect(supports(spec("tpdb"), "site_categories")).toBe(false);
  });

  it("declares no fingerprint reports on ThePornDB", () => {
    // It publishes how many people submitted a fingerprint and never how many
    // disputed it, which is what makes reports and contested null on its matches.
    expect(supports(spec("tpdb"), "fingerprint_reports")).toBe(false);
  });

  it("declares the record reads and the fingerprint route on ThePornDB", () => {
    expect(supports(spec("tpdb"), "get_scene")).toBe(true);
    expect(supports(spec("tpdb"), "get_performer")).toBe(true);
    expect(supports(spec("tpdb"), "find_by_fingerprint")).toBe(true);
  });

  it("declares ThePornDB with exactly the three capabilities it answers", () => {
    expect([...spec("tpdb").capabilities].sort()).toEqual(
      ["find_by_fingerprint", "get_performer", "get_scene"].sort(),
    );
  });

  it("lists each capability at most once per instance", () => {
    for (const instance of INSTANCES) {
      expect(new Set(instance.capabilities).size).toBe(instance.capabilities.length);
    }
  });

  it("declares the fingerprint route on every instance, since it is the tool that joins them", () => {
    for (const instance of INSTANCES) {
      expect(supports(instance, "find_by_fingerprint")).toBe(true);
    }
  });
});

describe("instanceById", () => {
  it("returns the spec an id names", () => {
    expect(instanceById("stashdb")?.name).toBe("StashDB");
  });

  it("returns the same object the registry holds", () => {
    expect(instanceById("pmv")).toBe(INSTANCES.find((instance) => instance.id === "pmv"));
  });

  it("returns undefined for an id nothing declares", () => {
    expect(instanceById("nowhere")).toBeUndefined();
  });

  it("returns undefined for an empty id", () => {
    expect(instanceById("")).toBeUndefined();
  });

  it("matches an id exactly, so a differently cased id resolves to nothing", () => {
    expect(instanceById("StashDB")).toBeUndefined();
  });

  it("resolves every id the registry declares", () => {
    for (const instance of INSTANCES) {
      expect(instanceById(instance.id)).toBe(instance);
    }
  });
});

describe("supports", () => {
  it("reads the declaration and nothing else", () => {
    const declared: InstanceSpec = {
      id: "stashdb",
      name: "StashDB",
      endpoint: "https://stashdb.org/graphql",
      webBase: "https://stashdb.org",
      envVar: "STASHBOX_STASHDB_KEY",
      capabilities: ["get_scene"],
      dialect: "strict",
    };
    expect(supports(declared, "get_scene")).toBe(true);
    expect(supports(declared, "get_performer")).toBe(false);
  });

  it("answers false when an instance declares nothing", () => {
    const declared: InstanceSpec = {
      id: "tpdb",
      name: "ThePornDB",
      endpoint: "https://theporndb.net/graphql",
      webBase: "https://theporndb.net",
      envVar: "STASHBOX_TPDB_KEY",
      capabilities: [],
      dialect: "loose",
    };
    for (const capability of ALL_CAPABILITIES) {
      expect(supports(declared, capability)).toBe(false);
    }
  });
});
