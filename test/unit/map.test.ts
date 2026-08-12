/**
 * What a record is allowed to say once a catalogue's answer has been read into
 * it.
 *
 * Everything here drives the reading directly, with hand-built answers, because
 * every rule it holds is otherwise pinned only through a tool that happens to
 * exercise it. A rule reached sideways is a rule a rewrite drops in silence.
 *
 * One sentence governs the file: the server never states anything the data does
 * not carry. Four readings of it decide what is asserted. A row this client
 * cannot read is a loss, and a loss is counted and named rather than dropped. An
 * identifier printed is one this server would take back. A field a catalogue
 * does not publish is told apart from a record carrying none. A marker describes
 * the record its identifier now addresses, never the world.
 *
 * Nothing leaves this file: every answer is invented, no catalogue is asked, and
 * the clock is fake and pinned, so an assertion is decided by what the reading
 * does with a payload and never by a network or a clock.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { instanceById } from "../../src/stashbox/instances.js";
import type { InstanceSpec } from "../../src/stashbox/instances.js";
import { mapPerformer, mapScene } from "../../src/stashbox/map.js";

/* ------------------------------------------------------------------ pinning */

/** Pinned, so no assertion here reads a clock. */
const EPOCH = new Date("2026-08-11T00:00:00.000Z");
const RETRIEVED_AT = "2026-08-11T00:00:00.000Z";

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(EPOCH);
});

afterAll(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ helpers */

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** A field of a record, whichever of the two spellings carries it. */
function field(payload: unknown, key: string): unknown {
  if (payload === null || typeof payload !== "object") return undefined;
  const obj = payload as Record<string, unknown>;
  return toSnake(key) in obj ? obj[toSnake(key)] : obj[toCamel(key)];
}

/**
 * A catalogue answering every route and publishing every optional field, and one
 * answering three routes and publishing none of them. Both are taken from the
 * registry, since the registry is the single register of what a catalogue offers.
 */
const FULL = instanceById("stashdb") as InstanceSpec;
const SPARSE = instanceById("tpdb") as InstanceSpec;

function readScene(raw: unknown, spec: InstanceSpec = FULL): unknown {
  return mapScene(raw as never, spec, RETRIEVED_AT);
}

function readPerformer(raw: unknown, spec: InstanceSpec = FULL): unknown {
  return mapPerformer(raw as never, spec, RETRIEVED_AT);
}

function skipped(record: unknown): number {
  return Number(field(record, "rowsSkipped") ?? 0);
}

/** The lists a record says it lost rows from, as one string a rule can read. */
function skippedIn(record: unknown): string {
  return ((field(record, "rowsSkippedIn") as string[] | undefined) ?? []).join(" ");
}

/** Everything a record prints, so a rule can say a value reached no reader. */
function printed(record: unknown): string {
  return JSON.stringify(record ?? null);
}

/** A copy of an answer with some of its keys never published at all. */
function without(raw: Record<string, unknown>, ...keys: string[]): Record<string, unknown> {
  const copy = { ...raw };
  for (const key of keys) delete copy[key];
  return copy;
}

/* ----------------------------------------------------------------- fixtures */

const SCENE_ID = "94ef9c17-82c6-48b0-8dcc-063b69231960";
const SCENE_HEIR = "3f2a1c88-0d47-4e19-9a55-71b0c2d4e6f8";
const PERFORMER_ID = "6b1d5e20-9c3a-4f77-b2ec-58a1d0e93c44";
const PERFORMER_HEIR = "c40e8b71-2a95-4d63-9f18-7e5b3c0a6d22";
const ABSORBED_ID = "aa77b3d9-5e41-4c08-84f2-19c6d7e0b533";
const STUDIO_ID = "d1c9f4a6-3b72-4e85-9017-6a2f8c5d3e91";
const PARENT_ID = "7c3b9e15-4a08-4d26-b7f1-e9524c8a0d63";
const TAG_ID = "5e0a7c31-8d46-4b92-a3f5-c7180b6e4d29";
const IMAGE_ID = "2d8f6b04-7e19-4a53-8c60-f4b19d7e2a85";

const MD5 = "0badc0ffee1122334455667788990011";

/** Every string this suite feeds where a uuid belongs, none of them printable. */
const NOT_A_UUID = "not-a-uuid";

const STUDIO = {
  id: STUDIO_ID,
  name: "Harbour Lights Pictures",
  deleted: false,
  parent: { id: PARENT_ID, name: "Harbour Group", deleted: false },
};

const TAG = {
  id: TAG_ID,
  name: "harbour-at-dusk",
  deleted: false,
  category: { id: TAG_ID, name: "Setting" },
};

const CREDIT = {
  as: "Angie",
  performer: {
    id: PERFORMER_ID,
    name: "Ilva Norrsken",
    disambiguation: "I",
    deleted: false,
    merged_into_id: null,
  },
};

const LINK = {
  url: "https://example-listing.test/a",
  site: { name: "The Listing", category: { name: "STUDIO" } },
};

const IMAGE = {
  id: IMAGE_ID,
  url: "https://images.example.test/one.jpg",
  width: 1920,
  height: 1080,
};

const PRINT = { algorithm: "MD5", hash: MD5, duration: 1500, submissions: 3, reports: 0 };

/** A scene as a catalogue publishes one, with every list readable. */
function sceneRaw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: SCENE_ID,
    title: "Harbour Lights, Chapter Two",
    details: "Filmed on the quay over two nights.",
    release_date: "2019-04-12",
    production_date: "2019-03-01",
    duration: 1500,
    code: "HL-002",
    director: "Ines Marchetti",
    deleted: false,
    studio: STUDIO,
    tags: [TAG],
    urls: [LINK],
    performers: [CREDIT],
    edits: [{ status: "PENDING" }, { status: "ACCEPTED" }],
    images: [IMAGE],
    fingerprints: [PRINT],
    created: "2020-01-01T00:00:00Z",
    updated: "2020-02-01T00:00:00Z",
    ...over,
  };
}

/** A performer as a catalogue publishes one, with every list readable. */
function performerRaw(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: PERFORMER_ID,
    name: "Ilva Norrsken",
    disambiguation: "I",
    aliases: ["Angie", "Ilva N."],
    gender: "FEMALE",
    country: "AU",
    birth_date: "1985-06-02",
    death_date: null,
    career_start_year: 2003,
    career_end_year: null,
    scene_count: 12,
    deleted: false,
    merged_into_id: null,
    merged_ids: [ABSORBED_ID],
    urls: [LINK],
    edits: [{ status: "PENDING" }],
    ethnicity: "CAUCASIAN",
    eye_color: "BLUE",
    hair_color: "BROWN",
    height: 167,
    cup_size: "D",
    band_size: 32,
    waist_size: 26,
    hip_size: 36,
    breast_type: "NATURAL",
    tattoos: [{ location: "left forearm", description: "a rose" }],
    piercings: [{ location: "ear", description: null }],
    images: [IMAGE],
    studios: [{ studio: STUDIO, scene_count: 4 }],
    created: "2020-01-01T00:00:00Z",
    updated: "2020-02-01T00:00:00Z",
    ...over,
  } as Record<string, unknown>;
}

/* ------------------------------------------- 0. the clean answer loses nothing */

describe("an answer this client can read whole loses nothing", () => {
  it("counts no loss on a scene and no loss on a performer", () => {
    const scene = readScene(sceneRaw());
    const performer = readPerformer(performerRaw());

    expect(scene, "a readable scene came back as no record at all").not.toBeNull();
    expect(performer, "a readable performer came back as no record at all").not.toBeNull();
    expect(
      skipped(scene),
      `a scene every list of which is readable reported ${skipped(scene)} lost row(s), so every loss counted below would be attributed to the wrong list`,
    ).toBe(0);
    expect(
      skipped(performer),
      `a performer every list of which is readable reported ${skipped(performer)} lost row(s), so every loss counted below would be attributed to the wrong list`,
    ).toBe(0);
  });
});

/* -------------------------------------------- 1. every discarded row is counted */

interface Loss {
  /** The list the row belongs to, as this suite names it. */
  list: string;
  /** How the record must name the list it lost the row from. */
  named: RegExp;
  raw: Record<string, unknown>;
  read: (raw: Record<string, unknown>) => unknown;
}

const LOSSES: Loss[] = [
  {
    list: "links",
    named: /url|link|site/i,
    raw: sceneRaw({ urls: [7] }),
    read: readScene,
  },
  {
    list: "tags",
    named: /tag/i,
    raw: sceneRaw({ tags: [null] }),
    read: readScene,
  },
  {
    list: "credited performers",
    named: /performer|credit|cast/i,
    raw: sceneRaw({ performers: ["Ilva Norrsken"] }),
    read: readScene,
  },
  {
    list: "the studio",
    named: /studio/i,
    raw: sceneRaw({ studio: 7 }),
    read: readScene,
  },
  {
    list: "the studio's parent",
    named: /parent|studio/i,
    raw: sceneRaw({ studio: { ...STUDIO, parent: "Harbour Group" } }),
    read: readScene,
  },
  {
    list: "images",
    named: /image/i,
    raw: sceneRaw({ images: [null] }),
    read: readScene,
  },
  {
    list: "fingerprints",
    named: /fingerprint|hash|print/i,
    raw: sceneRaw({ fingerprints: [7] }),
    read: readScene,
  },
  {
    list: "a marker's own title",
    named: /title/i,
    raw: sceneRaw({ deleted: true, title: { nested: "Harbour Lights, Chapter Two" } }),
    read: readScene,
  },
  {
    list: "aliases",
    named: /alias/i,
    raw: performerRaw({ aliases: ["Angie", 7] }),
    read: readPerformer,
  },
  {
    list: "absorbed identifiers",
    named: /merged|absorbed|folded|id/i,
    raw: performerRaw({ merged_ids: [NOT_A_UUID] }),
    read: readPerformer,
  },
  {
    list: "the successor",
    named: /merged|successor|folded/i,
    raw: performerRaw({ deleted: true, merged_into_id: NOT_A_UUID }),
    read: readPerformer,
  },
  {
    list: "body modifications",
    named: /tattoo|piercing|modification|appearance/i,
    raw: performerRaw({ tattoos: [7], piercings: [null] }),
    read: readPerformer,
  },
  {
    list: "a marker's own name",
    named: /name/i,
    raw: performerRaw({ deleted: true, merged_into_id: null, name: 7 }),
    read: readPerformer,
  },
];

describe("every row this client could not read is counted, and the counter names its list", () => {
  for (const loss of LOSSES) {
    it(`counts a row lost from ${loss.list}`, () => {
      const record = loss.read(loss.raw);

      expect(
        record,
        `an unreadable row in ${loss.list} took the whole record with it, so nothing is left to count the loss on`,
      ).not.toBeNull();
      expect(
        skipped(record),
        `a row of ${loss.list} this client could not read was dropped uncounted, so the record reads as one the catalogue holds nothing in that list for`,
      ).toBeGreaterThan(0);
      expect(
        skippedIn(record),
        `the record counts a lost row and names no list, so a reader cannot tell which part of it is short`,
      ).not.toBe("");
      expect(
        skippedIn(record),
        `a row of ${loss.list} was counted against a list that is not the one it came from`,
      ).toMatch(loss.named);
    });
  }
});

/* -------------------------- 2. every identifier printed is one taken back */

/** Nested identifiers that are no uuid, each in the list that carries it. */
const NESTED: { list: string; raw: Record<string, unknown>; read: (r: never) => unknown }[] = [
  {
    list: "the studio",
    raw: sceneRaw({ studio: { ...STUDIO, id: NOT_A_UUID } }),
    read: readScene as never,
  },
  {
    list: "the studio's parent",
    raw: sceneRaw({ studio: { ...STUDIO, parent: { id: NOT_A_UUID, name: "X", deleted: false } } }),
    read: readScene as never,
  },
  {
    list: "a tag",
    raw: sceneRaw({ tags: [{ ...TAG, id: NOT_A_UUID }] }),
    read: readScene as never,
  },
  {
    list: "a credited performer",
    raw: sceneRaw({
      performers: [{ ...CREDIT, performer: { ...CREDIT.performer, id: NOT_A_UUID } }],
    }),
    read: readScene as never,
  },
  {
    list: "an absorbed identifier",
    raw: performerRaw({ merged_ids: [NOT_A_UUID] }),
    read: readPerformer as never,
  },
  {
    list: "a successor",
    raw: performerRaw({ deleted: true, merged_into_id: NOT_A_UUID }),
    read: readPerformer as never,
  },
  {
    list: "a performer's studio",
    raw: performerRaw({ studios: [{ studio: { ...STUDIO, id: NOT_A_UUID }, scene_count: 4 }] }),
    read: readPerformer as never,
  },
];

describe("every identifier printed is one this server would accept back", () => {
  for (const nested of NESTED) {
    it(`prints nothing, and counts the loss, where ${nested.list} carries no uuid`, () => {
      const record = (nested.read as (raw: unknown) => unknown)(nested.raw);

      expect(
        record,
        `an unreadable nested identifier took the whole record with it`,
      ).not.toBeNull();
      expect(
        printed(record),
        `an identifier the next call would refuse was printed where ${nested.list} is named`,
      ).not.toContain(NOT_A_UUID);
      expect(
        skipped(record),
        `an identifier this server could not print was dropped uncounted, so the record states ${nested.list} is absent where it was unreadable`,
      ).toBeGreaterThan(0);
    });
  }

  it("prints every identifier it does publish as instance:uuid", () => {
    const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    const namespaced = new RegExp(`^${FULL.id}:${uuid}$`, "i");
    const scene = readScene(sceneRaw());
    const performer = readPerformer(performerRaw());

    const ids: { path: string; value: unknown }[] = [
      { path: "scene.id", value: field(scene, "id") },
      { path: "scene.studio.id", value: field(field(scene, "studio"), "id") },
      {
        path: "scene.tags[0].id",
        value: field((field(scene, "tags") as unknown[])[0], "id"),
      },
      {
        path: "scene.performers[0].id",
        value: field((field(scene, "performers") as unknown[])[0], "id"),
      },
      { path: "performer.id", value: field(performer, "id") },
      {
        path: "performer.mergedIds[0]",
        value: ((field(performer, "mergedIds") as unknown[]) ?? [])[0],
      },
    ];

    for (const entry of ids) {
      expect(
        String(entry.value),
        `${entry.path} was printed in a form this server would not accept back`,
      ).toMatch(namespaced);
    }
  });
});

/* ------------------- 3. a field never published, and a record carrying none */

describe("a field a catalogue does not publish is told apart from a record carrying none", () => {
  it("reads a site's category only where the catalogue publishes a table of them", () => {
    const full = readScene(sceneRaw(), FULL);
    const sparse = readScene(sceneRaw(), SPARSE);

    expect(
      field((field(full, "urls") as unknown[])[0], "siteCategory"),
      "a catalogue publishing a table of site categories had its category left unread",
    ).toBe("STUDIO");
    expect(
      field((field(sparse, "urls") as unknown[])[0], "siteCategory"),
      "a category was stated for a catalogue that publishes no table of them, so a reader takes it for that catalogue's own",
    ).toBeNull();
  });

  it("reads a tag's category only where the catalogue publishes a taxonomy", () => {
    const full = readScene(sceneRaw(), FULL);
    const sparse = readScene(sceneRaw(), SPARSE);

    expect(
      field((field(full, "tags") as unknown[])[0], "category"),
      "a catalogue publishing a taxonomy had its tag category left unread",
    ).toBe("Setting");
    expect(
      field((field(sparse, "tags") as unknown[])[0], "category"),
      "a tag category was stated for a catalogue that publishes no taxonomy",
    ).toBeNull();
  });

  it("reads a fingerprint's reports only where the catalogue counts disputes", () => {
    const full = readScene(sceneRaw({ fingerprints: [{ ...PRINT, reports: 2 }] }), FULL);
    const sparse = readScene(sceneRaw({ fingerprints: [{ ...PRINT, reports: 2 }] }), SPARSE);

    const readable = (field(full, "fingerprints") as unknown[])[0];
    const unread = (field(sparse, "fingerprints") as unknown[])[0];

    expect(
      field(readable, "reports"),
      "a catalogue counting disputes had its report count left unread",
    ).toBe(2);
    expect(
      field(unread, "reports"),
      "a report count was stated for a catalogue that counts no disputes",
    ).toBeNull();
    expect(
      field(unread, "contested"),
      "a fingerprint was published as disputed or undisputed on a catalogue that counts no disputes, so a silence was read as a verdict",
    ).toBeNull();
  });

  it("reads a scene count only where the catalogue publishes one", () => {
    const full = readPerformer(performerRaw(), FULL);
    const sparse = readPerformer(performerRaw(), SPARSE);

    expect(
      field(full, "sceneCount"),
      "a catalogue publishing a scene count had it left unread",
    ).toBe(12);
    expect(
      field(sparse, "sceneCount"),
      "a scene count was stated for a catalogue that publishes none, so a reader takes its coverage for measured",
    ).toBeNull();
  });

  it("reads the open edits only where the catalogue publishes them", () => {
    const full = readScene(sceneRaw(), FULL);
    const sparse = readScene(sceneRaw(), SPARSE);

    expect(
      field(full, "pendingEdits"),
      "a catalogue publishing its open edits had them left uncounted",
    ).toBe(1);
    expect(
      field(sparse, "pendingEdits"),
      "a number of open edits was stated for a catalogue that publishes none, so a record reads as settled that nobody has checked",
    ).toBeNull();
  });
});

/* ------------------------------------------------------------- 4. markers */

describe("a marker describes the record its identifier now addresses", () => {
  it("keeps a withdrawn scene's former title and empties its body", () => {
    const record = readScene(sceneRaw({ deleted: true }));

    expect(field(record, "status"), "a withdrawn scene came back as something else").toBe(
      "deleted",
    );
    expect(
      field(record, "title"),
      "a withdrawn scene lost the title it held, so its identifier addresses nothing a reader can recognise",
    ).toBe("Harbour Lights, Chapter Two");
    for (const key of ["details", "code", "director", "durationSeconds", "releaseDate", "studio"]) {
      expect(
        field(record, key),
        `a withdrawn scene published ${key}, which states about the world what the marker states about the record`,
      ).toBeNull();
    }
    for (const key of ["performers", "tags", "urls"]) {
      expect(
        field(record, key),
        `a withdrawn scene published a ${key} list, which states about the world what the marker states about the record`,
      ).toEqual([]);
    }
  });

  it("keeps a withdrawn scene's fingerprints, since a hash states what a file is", () => {
    const record = readScene(sceneRaw({ deleted: true }));

    expect(
      field(record, "fingerprints"),
      "a withdrawn scene dropped the fingerprints it carries, and a hash states what a file is rather than what a scene holds",
    ).toHaveLength(1);
    expect(field((field(record, "fingerprints") as unknown[])[0], "hash")).toBe(MD5);
  });

  it("names the record a folded performer continues into", () => {
    const record = readPerformer(performerRaw({ deleted: true, merged_into_id: PERFORMER_HEIR }));

    expect(field(record, "status"), "a folded performer came back as something else").toBe(
      "merged",
    );
    expect(
      field(record, "mergedInto"),
      "a folded performer named no record for a caller to read next",
    ).toBe(`${FULL.id}:${PERFORMER_HEIR}`);
  });

  it("leaves a performer folded where the successor is no identifier", () => {
    const record = readPerformer(performerRaw({ deleted: true, merged_into_id: NOT_A_UUID }));

    expect(
      field(record, "status"),
      "a record the catalogue folded into a successor this client could not read was published as one the catalogue withdrew outright, which states the catalogue lost it",
    ).toBe("merged");
    expect(
      field(record, "mergedInto"),
      "a successor that is no identifier was published as one",
    ).toBeNull();
    expect(
      skipped(record),
      "a successor lost on the marker branch was dropped uncounted",
    ).toBeGreaterThan(0);
  });

  it("offers no record as the record that continues itself", () => {
    const record = readPerformer(performerRaw({ deleted: true, merged_into_id: PERFORMER_ID }));

    expect(
      field(record, "mergedInto"),
      "a record was published as continuing into itself, so a caller reading the successor reads the record it already has",
    ).not.toBe(`${FULL.id}:${PERFORMER_ID}`);
  });

  it("never publishes a scene as merged", () => {
    const record = readScene(sceneRaw({ deleted: true, merged_into_id: SCENE_HEIR }));

    expect(
      field(record, "status"),
      "a scene was published as folded into a successor, and these catalogues publish none for one",
    ).not.toBe("merged");
    expect(
      printed(record),
      "a scene named a successor a caller would read next, and these catalogues publish none for one",
    ).not.toContain(SCENE_HEIR);
  });
});

/* ------------------------------------------- 5. counts and measurements */

describe("a count is a whole number of things, and a measurement of zero is none", () => {
  for (const value of [3.7, 1e21, -1]) {
    it(`publishes ${value} as no scene count`, () => {
      const record = readPerformer(performerRaw({ scene_count: value }));

      expect(
        field(record, "sceneCount"),
        `${value} was published as a number of scenes an index holds`,
      ).toBeNull();
    });
  }

  it("keeps a counted zero as a count", () => {
    const record = readPerformer(performerRaw({ scene_count: 0 }));

    expect(
      field(record, "sceneCount"),
      "a catalogue that indexed no scene for a performer was published as one that counted none, which is a different statement",
    ).toBe(0);
  });

  it("keeps a fingerprint nobody reported as one nobody reported", () => {
    const record = readScene(sceneRaw({ fingerprints: [{ ...PRINT, reports: 0 }] }));
    const print = (field(record, "fingerprints") as unknown[])[0];

    expect(
      field(print, "reports"),
      "a count of nought reports was published as a count nobody took",
    ).toBe(0);
    expect(
      field(print, "contested"),
      "a fingerprint counted and reported by nobody was published as one whose disputes are unknown",
    ).toBe(false);
  });

  for (const value of [2.5, 1e21]) {
    it(`publishes ${value} as no number of submissions and no number of seconds`, () => {
      const record = readScene(
        sceneRaw({ fingerprints: [{ ...PRINT, submissions: value, duration: value }] }),
      );
      const print = (field(record, "fingerprints") as unknown[])[0];

      expect(
        field(print, "submissions"),
        `${value} was published as a number of people who submitted a hash`,
      ).toBeNull();
      expect(
        field(print, "durationSeconds"),
        `${value} was published as a number of seconds`,
      ).toBeNull();
    });
  }

  it("publishes a height of zero as no height", () => {
    const record = readPerformer(performerRaw({ height: 0 }));
    const appearance = field(record, "appearance");

    expect(
      field(appearance, "heightCm"),
      "a height of nought centimetres was published as a measurement, and nobody is that tall",
    ).toBeNull();
  });

  it("publishes a duration of zero as no duration", () => {
    const record = readScene(sceneRaw({ duration: 0 }));

    expect(
      field(record, "durationSeconds"),
      "a length of nought seconds was published as a measurement, and no scene is that long",
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------- 6. dates */

describe("a date keeps the precision it was entered with, and a date lost is named", () => {
  it("keeps a scene released to the year at the year", () => {
    const record = readScene(sceneRaw({ release_date: "2019" }));

    expect(
      field(record, "releaseDate"),
      "a date entered as a year was widened or narrowed, which puts a day in front of a reader that nobody entered",
    ).toEqual({ value: "2019", precision: "year" });
  });

  it("keeps a performer born to the year at the year", () => {
    const record = readPerformer(performerRaw({ birth_date: "1985" }));

    expect(field(record, "birthDate"), "a date entered as a year was widened or narrowed").toEqual({
      value: "1985",
      precision: "year",
    });
  });

  it("flags a published date this client could not read rather than dropping it", () => {
    const record = readScene(sceneRaw({ release_date: "2019-02-31" }));

    expect(
      field(record, "releaseDate"),
      "a value naming no day on a calendar was published as a date",
    ).toBeNull();
    expect(
      field(record, "releaseDateUnreadable"),
      "the catalogue published a release date and this client could not read it, and the record says nothing about it, so its silence reads as the catalogue's",
    ).toBe(true);
  });

  it("flags a published date of death this client could not read", () => {
    const record = readPerformer(performerRaw({ death_date: "12/04/2019" }));

    expect(
      field(record, "deathDate"),
      "a value in another order was published as a date",
    ).toBeNull();
    expect(
      field(record, "deathDateUnreadable"),
      "the catalogue published a date of death and this client could not read it, and the record says nothing about it",
    ).toBe(true);
  });

  it("flags nothing where the catalogue published no date at all", () => {
    const record = readScene(sceneRaw({ release_date: null }));

    expect(field(record, "releaseDate")).toBeNull();
    expect(
      field(record, "releaseDateUnreadable"),
      "a catalogue publishing no date was reported as one publishing a date this client could not read",
    ).not.toBe(true);
  });
});

/* -------------------------------------------------------------- 7. sections */

describe("a section nobody asked for is absent, and one asked for and empty is empty", () => {
  const cases: {
    what: string;
    key: string;
    read: (raw: Record<string, unknown>) => unknown;
    base: () => Record<string, unknown>;
  }[] = [
    { what: "a scene's fingerprints", key: "fingerprints", read: readScene, base: sceneRaw },
    { what: "a scene's images", key: "images", read: readScene, base: sceneRaw },
    { what: "a performer's images", key: "images", read: readPerformer, base: performerRaw },
    { what: "a performer's studios", key: "studios", read: readPerformer, base: performerRaw },
  ];

  for (const one of cases) {
    it(`leaves ${one.what} out of a record nobody asked for them on`, () => {
      const record = one.read(without(one.base(), one.key));

      expect(
        field(record, one.key),
        `${one.what} was published as a section holding nothing, where the section was never asked for, so an emptiness nobody enquired about reads as an answer`,
      ).toBeUndefined();
    });

    it(`publishes ${one.what} as an empty section where they were asked for and are none`, () => {
      const record = one.read({ ...one.base(), [one.key]: [] });

      expect(
        field(record, one.key),
        `${one.what} were asked for and the catalogue holds none, and the record leaves the section out, so a reader cannot tell the question was put`,
      ).toEqual([]);
    });
  }
});
