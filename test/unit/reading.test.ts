/**
 * What a record is allowed to say once a catalogue's answer has been read into
 * it.
 *
 * Everything here drives the reading directly, with hand-built answers, because
 * a rule reached sideways through a tool is a rule a rewrite drops in silence.
 * Nothing leaves this file: no catalogue is asked, and the clock is fixed, so an
 * assertion is decided by what the reading does with a payload.
 *
 * The shapes below are the shapes two catalogues actually answered with on
 * 2026-08-13. Four readings of the one rule decide what is asserted.
 *
 * **A row this client cannot read is a loss, and a loss is counted and named.**
 * Dropped in silence, it becomes a record holding less than the catalogue holds,
 * and nothing in the answer says so.
 *
 * **A number that cannot mean what it says is unknown.** A catalogue publishes
 * `-1` for the width of an image whose size it has not recorded. Carried
 * through, it becomes an image one pixel wide in the wrong direction.
 *
 * **A field a catalogue does not publish is told apart from one a record leaves
 * empty.** The first is read from the registry, the second from the record.
 *
 * **An identifier printed is one this server would take back.** A record whose
 * identifier is not a uuid can be addressed by nobody, so it is a loss rather
 * than a row with a broken address.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { instanceById } from "../../src/stashbox/instances.js";
import { readPerformer, readScene, readStudio, readTag } from "../../src/stashbox/read.js";

const EPOCH = new Date("2026-08-13T00:00:00.000Z");
const AT = "2026-08-13T00:00:00.000Z";

beforeAll(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(EPOCH);
});
afterAll(() => vi.useRealTimers());

const SD = instanceById("stashdb")!;
const TP = instanceById("tpdb")!;

const UUID = "001659bc-3cfc-4b65-9419-958e91d9bcf4";
const UUID2 = "155f2559-d1f1-42b1-8cbe-9008542df5ce";

/** A scene as StashDB answered one, trimmed to what a test needs. */
const SCENE = {
  id: UUID,
  title: "Awakening",
  details: "Dr Marla Quint sits beside her patient.",
  release_date: "2017-11-02",
  production_date: null,
  code: null,
  director: null,
  duration: 2557,
  deleted: false,
  created: "2020-07-07T12:39:35Z",
  updated: "2022-03-09T05:21:01Z",
  studio: { id: UUID2, name: "Fieldhouse", deleted: false, parent: null },
  performers: [{ as: null, performer: { id: UUID2, name: "Marla Quint", deleted: false } }],
  tags: [
    { id: UUID2, name: "Brown Hair", deleted: false, category: { id: UUID, name: "Hair Color" } },
  ],
  urls: [{ url: "https://example.invalid/a", site: { id: UUID, name: "Twitter" } }],
  images: [{ id: UUID, url: "https://stashdb.org/images/x", width: 960, height: 544 }],
  fingerprints: [
    {
      hash: "ea6ad830d7aa581b",
      algorithm: "PHASH",
      duration: 2556,
      submissions: 126,
      reports: 0,
      user_submitted: false,
    },
  ],
};

/* ------------------------------------------------------ a number that lies */

describe("a measurement a catalogue could not record", () => {
  it("reads a negative width as unknown rather than as a size", () => {
    // Measured: one catalogue answers -1 for both dimensions of an image whose
    // size it has not recorded. A width of minus one describes no image.
    const read = readScene(
      { ...SCENE, images: [{ id: UUID, url: "https://x.invalid/a", width: -1, height: -1 }] },
      SD,
      AT,
    );
    expect(read.record?.images?.[0]).toMatchObject({ width: null, height: null });
  });

  it("counts no loss for it, since the catalogue answered exactly what it holds", () => {
    const read = readScene(
      { ...SCENE, images: [{ id: UUID, url: "https://x.invalid/a", width: -1, height: -1 }] },
      SD,
      AT,
    );
    expect(read.record?.imagesSkipped).toBeUndefined();
    expect(read.record?.images).toHaveLength(1);
  });

  it("reads a size the catalogue did record", () => {
    const read = readScene(SCENE, SD, AT);
    expect(read.record?.images?.[0]).toMatchObject({ width: 960, height: 544 });
  });

  it("refuses a count that is not a whole number of things", () => {
    for (const bad of [-3, 1.5, Number.NaN, "many", null]) {
      const read = readScene(
        { ...SCENE, fingerprints: [{ ...SCENE.fingerprints[0], submissions: bad }] },
        SD,
        AT,
      );
      expect(read.record?.fingerprints?.[0]?.submissions).toBeNull();
    }
  });
});

/* -------------------------------------------------- two durations, one word */

describe("a fingerprint carries its own runtime", () => {
  it("keeps it apart from the runtime of the scene", () => {
    // Measured: 2556 against the scene's 2557. One is the runtime submitted
    // with the hash, the other what the catalogue holds for the release.
    const read = readScene(SCENE, SD, AT);
    expect(read.record?.durationSeconds).toBe(2557);
    expect(read.record?.fingerprints?.[0]?.durationSeconds).toBe(2556);
  });

  it("carries whether a person submitted it, which a catalogue publishes", () => {
    const read = readScene(SCENE, SD, AT);
    expect(read.record?.fingerprints?.[0]?.userSubmitted).toBe(false);
  });
});

/* ---------------------------------------------------------------- a loss */

describe("a row this client cannot read", () => {
  it("is left out and counted, rather than dropped", () => {
    const read = readScene(
      { ...SCENE, tags: [SCENE.tags[0], { id: "not-a-uuid", name: "Broken" }] },
      SD,
      AT,
    );
    expect(read.record?.tags).toHaveLength(1);
    expect(read.record?.rowsSkipped).toBe(1);
  });

  it("names the list it came from, so the number says what it counts", () => {
    const read = readScene({ ...SCENE, tags: [{ id: "not-a-uuid", name: "Broken" }] }, SD, AT);
    expect(read.record?.rowsSkippedIn).toEqual(["tags"]);
  });

  it("counts a list that is not a list at all as one loss, and holds none", () => {
    const read = readScene({ ...SCENE, tags: "everything" }, SD, AT);
    expect(read.record?.tags).toEqual([]);
    expect(read.record?.rowsSkipped).toBe(1);
  });

  it("refuses the whole record where its own identifier is no uuid", () => {
    // Printed, it would be an address this server would refuse back.
    expect(readScene({ ...SCENE, id: "42" }, SD, AT).record).toBeNull();
  });

  it("refuses a record answering with no identifier at all", () => {
    const { id: _id, ...headless } = SCENE;
    expect(readScene(headless, SD, AT).record).toBeNull();
  });
});

/* --------------------------------------------------------------- the dates */

describe("a date is read at the precision it was entered with", () => {
  const cases: [string, string, "day" | "month" | "year"][] = [
    ["a whole day", "2017-11-02", "day"],
    ["a month", "2017-11", "month"],
    ["a year", "2017", "year"],
  ];

  for (const [what, value, precision] of cases) {
    it(`reads ${what}`, () => {
      const read = readScene({ ...SCENE, release_date: value }, SD, AT);
      expect(read.record?.releaseDate).toEqual({ value, precision });
    });
  }

  it("marks a date it cannot read rather than leaving the field empty", () => {
    // A record missing a date it was published with reads as one carrying none.
    const read = readScene({ ...SCENE, release_date: "the summer of 2017" }, SD, AT);
    expect(read.record?.releaseDate).toBeNull();
    expect(read.record?.releaseDateUnreadable).toBe(true);
  });

  it("leaves a date the record does not carry unmarked", () => {
    const read = readScene({ ...SCENE, release_date: null }, SD, AT);
    expect(read.record?.releaseDate).toBeNull();
    expect(read.record?.releaseDateUnreadable).toBeUndefined();
  });
});

/* ------------------------------------------------------------- the status */

describe("what an identifier addresses now", () => {
  it("reads a record the catalogue still holds as held", () => {
    expect(readScene(SCENE, SD, AT).record?.status).toBe("established");
  });

  it("reads a scene the catalogue withdrew as withdrawn, naming no successor", () => {
    // Measured: a scene declares no field naming a record it was folded into.
    const read = readScene({ ...SCENE, deleted: true }, SD, AT);
    expect(read.record?.status).toBe("deleted");
    expect(read.record).not.toHaveProperty("mergedInto");
  });

  it("reads a performer folded into another as merged, naming the successor", () => {
    // The catalogue's own flag decides: a record it still holds as itself is
    // held, and a successor named beside that changes nothing about it.
    const read = readPerformer(
      { id: UUID2, name: "A", deleted: true, merged_into_id: UUID, merged_ids: [] },
      SD,
      AT,
    );
    expect(read.record?.status).toBe("merged");
    expect(read.record?.mergedInto).toBe(`stashdb:${UUID}`);
  });

  it("keeps the fingerprints of a withdrawn scene, since a hash names a file", () => {
    const read = readScene({ ...SCENE, deleted: true }, SD, AT);
    expect(read.record?.fingerprints).toHaveLength(1);
  });
});

/* ------------------------------------------- what a catalogue does not publish */

describe("a field a catalogue publishes no table for", () => {
  it("is read from the registry rather than from the record's own null", () => {
    // This catalogue keeps no taxonomy of tags, so a tag from it carries no
    // category, and that is a fact about the catalogue.
    const read = readTag({ id: UUID, name: "Brown Hair", deleted: false }, TP, AT);
    expect(read.record?.category).toBeNull();
    expect(read.publishesCategories).toBe(false);
  });

  it("is told apart from a record its catalogue left uncategorised", () => {
    const read = readTag({ id: UUID, name: "Brown Hair", deleted: false, category: null }, SD, AT);
    expect(read.record?.category).toBeNull();
    expect(read.publishesCategories).toBe(true);
  });

  it("counts no report where the catalogue counts none, and calls it unknown", () => {
    const read = readScene(
      { ...SCENE, fingerprints: [{ ...SCENE.fingerprints[0], reports: 4 }] },
      TP,
      AT,
    );
    expect(read.record?.fingerprints?.[0]?.reports).toBeNull();
    expect(read.record?.fingerprints?.[0]?.contested).toBeNull();
  });
});

/* --------------------------------------------------------- the four entities */

describe("every entity is read into a record that names its catalogue", () => {
  it("reads a studio, with the parent it names", () => {
    const read = readStudio(
      {
        id: UUID,
        name: "Northgate",
        aliases: [],
        deleted: false,
        parent: { id: UUID2, name: "Northgate Media Group", deleted: false },
        urls: [],
      },
      SD,
      AT,
    );
    expect(read.record?.id).toBe(`stashdb:${UUID}`);
    expect(read.record?.parent).toMatchObject({
      id: `stashdb:${UUID2}`,
      name: "Northgate Media Group",
    });
    expect(read.record?.sourceUrl).toBe(`https://stashdb.org/studios/${UUID}`);
  });

  it("loses a parent that carries no identifier, and counts it", () => {
    const read = readStudio(
      { id: UUID, name: "Northgate", deleted: false, parent: { name: "A group" } },
      SD,
      AT,
    );
    expect(read.record?.parent).toBeNull();
    expect(read.record?.rowsSkipped).toBe(1);
  });

  it("reads a tag, with the group its category belongs to", () => {
    const read = readTag(
      {
        id: UUID,
        name: "120 FPS",
        description: "Scenes offered at 120 frames per second.",
        aliases: ["120帧"],
        deleted: false,
        category: { id: UUID2, name: "Shot Type", group: "SCENE" },
      },
      SD,
      AT,
    );
    expect(read.record?.category).toMatchObject({ name: "Shot Type", group: "SCENE" });
    expect(read.record?.aliases).toEqual(["120帧"]);
  });

  it("reads a performer, with the body a catalogue records", () => {
    const read = readPerformer(
      {
        id: UUID2,
        name: "Marla Quint",
        deleted: false,
        gender: "FEMALE",
        country: "AU",
        height: 160,
        cup_size: "G",
        band_size: 42,
        breast_type: "NATURAL",
        career_start_year: 2003,
        scene_count: 1041,
      },
      SD,
      AT,
    );
    expect(read.record?.appearance).toMatchObject({ heightCm: 160, cupSize: "G", bandSize: 42 });
    expect(read.record?.sceneCount).toBe(1041);
  });

  it("names the catalogue in every identifier it prints, at every depth", () => {
    const read = readScene(SCENE, SD, AT);
    expect(read.record?.id.startsWith("stashdb:")).toBe(true);
    expect(read.record?.studio?.id.startsWith("stashdb:")).toBe(true);
    expect(read.record?.performers[0]?.id.startsWith("stashdb:")).toBe(true);
    expect(read.record?.tags[0]?.id.startsWith("stashdb:")).toBe(true);
  });

  it("stamps every record with the moment it was read", () => {
    expect(readScene(SCENE, SD, AT).record?.retrievedAt).toBe(AT);
  });
});

/* ------------------------------------------------- the link that joins two */

describe("the category a catalogue sorted a site under", () => {
  it("is the table entry it sorted the site under, not the site's own blurb", () => {
    // Measured: a site declares a description of its own and a category of its
    // own. Read one for the other, every link in an answer carries a paragraph
    // labelled as a category.
    const read = readScene(
      {
        ...SCENE,
        urls: [
          {
            url: "https://example.invalid/a",
            site: {
              id: UUID,
              name: "Wikipedia",
              description: "Wikipedia is a free online encyclopedia.",
              category: { id: UUID2, name: "Third-party databases" },
            },
          },
        ],
      },
      SD,
      AT,
    );
    expect(read.record?.urls[0]?.siteCategory).toBe("Third-party databases");
    expect(read.record?.urls[0]?.siteName).toBe("Wikipedia");
  });
});

describe("the studios a catalogue credits a performer on", () => {
  it("are read where the block was asked for, with what it counts on each", () => {
    const read = readPerformer(
      {
        id: UUID2,
        name: "A",
        deleted: false,
        studios: [
          { scene_count: 12, studio: { id: UUID, name: "Northgate", deleted: false } },
          { scene_count: 3, studio: { id: "not-a-uuid", name: "Broken" } },
        ],
      },
      SD,
      AT,
    );
    expect(read.record?.studios).toHaveLength(1);
    expect(read.record?.studios?.[0]).toMatchObject({ name: "Northgate", sceneCount: 12 });
    // A line naming no studio of its own can be addressed by nobody, so it is
    // counted rather than dropped.
    expect(read.record?.studiosSkipped).toBe(1);
  });
});

describe("the link a catalogue publishes to the same record elsewhere", () => {
  it("is read as a join, carrying the catalogue and the identifier it names", () => {
    const read = readPerformer(
      {
        id: UUID2,
        name: "Marla Quint",
        deleted: false,
        urls: [
          { url: `https://theporndb.net/performers/${UUID}`, site: { name: "ThePornDB" } },
          { url: "https://x.com/marlawhite", site: { name: "Twitter" } },
        ],
      },
      SD,
      AT,
    );
    expect(read.record?.alsoHeldAt).toEqual([{ source: "tpdb", id: `tpdb:${UUID}` }]);
  });

  it("follows no link to a host outside the registry", () => {
    const read = readPerformer(
      {
        id: UUID2,
        name: "A",
        deleted: false,
        urls: [
          { url: `https://elsewhere.invalid/performers/${UUID}`, site: { name: "Elsewhere" } },
        ],
      },
      SD,
      AT,
    );
    expect(read.record?.alsoHeldAt).toEqual([]);
  });

  it("follows no link whose path carries no identifier", () => {
    const read = readPerformer(
      {
        id: UUID2,
        name: "A",
        deleted: false,
        urls: [{ url: "https://theporndb.net/performers/marla-white", site: { name: "TPDB" } }],
      },
      SD,
      AT,
    );
    expect(read.record?.alsoHeldAt).toEqual([]);
  });
});
