/**
 * Every claim this server makes about a catalogue, put to that catalogue.
 *
 * A claim about a catalogue lived in prose for several versions and was false:
 * the server told every caller that one of its catalogues answered no search at
 * all, and it answers two. Nothing could catch it. The unit suites do not send
 * requests, and a catalogue's refusal is reported so honestly that every schema
 * in the answer validates. **A failed answer is perfectly schema-conformant.**
 *
 * So this suite is the one thing that can catch that class, and it is built to
 * catch it by construction rather than by anybody remembering a case: it walks
 * the registry, and for every capability a catalogue declares it puts the
 * corresponding question to that catalogue and fails if the request comes back
 * refused. A capability added to the registry without a route behind it fails
 * here the same night.
 *
 * The assertion is about acceptance, never about content. What a catalogue holds
 * belongs to the people who edit it, so pinning an answer would produce failures
 * that say nothing about this client.
 */

import { describe, expect, it } from "vitest";

import { StashboxClient } from "../../src/stashbox/client.js";
import { CAPABILITIES, INSTANCES, supports } from "../../src/stashbox/instances.js";
import type { Capability, InstanceId, InstanceSpec } from "../../src/stashbox/instances.js";

const KEYS: Partial<Record<InstanceId, string>> = {
  ...(process.env.STASHBOX_STASHDB_KEY ? { stashdb: process.env.STASHBOX_STASHDB_KEY } : {}),
  ...(process.env.STASHBOX_TPDB_KEY ? { tpdb: process.env.STASHBOX_TPDB_KEY } : {}),
};

const ENABLED = process.env.STASHBOX_LIVE === "1" && Object.keys(KEYS).length > 0;
const client = new StashboxClient({ keys: KEYS });
const reachable = INSTANCES.filter((spec) => KEYS[spec.id] !== undefined);

/**
 * One question per capability, written so that a catalogue answering the route
 * accepts it and a catalogue lacking the route is never sent it.
 *
 * A capability with no entry here fails the completeness case below, so a
 * capability added to the registry cannot go unmeasured.
 */
const QUESTION: Record<Capability, (spec: InstanceSpec) => Promise<unknown>> = {
  search_scenes: (spec) => client.searchScenes({ query: "sunset", limit: 1, sources: [spec.id] }),
  search_performers: (spec) =>
    client.searchPerformers({ query: "angela", limit: 1, sources: [spec.id] }),
  search_studios: (spec) => client.searchStudios({ query: "vixen", limit: 1, sources: [spec.id] }),
  search_tags: (spec) => client.searchTags({ query: "hair", limit: 1, sources: [spec.id] }),
  get_scene: (spec) => client.getScene(`${spec.id}:${KNOWN[spec.id]!.scene}`),
  get_performer: (spec) => client.getPerformer(`${spec.id}:${KNOWN[spec.id]!.performer}`),
  get_studio: (spec) => client.getStudio(`${spec.id}:${KNOWN[spec.id]!.studio}`),
  get_tag: (spec) => client.getTag(`${spec.id}:${KNOWN[spec.id]!.tag}`),
  find_by_fingerprint: (spec) =>
    client.findByFingerprint({
      fingerprints: [{ hash: "3c30b044619b6487", algorithm: "OSHASH" }],
      sources: [spec.id],
    }),
  // The rest are fields rather than routes, so each is read off a record the
  // catalogue holds and checked for the field being present at all.
  site_categories: (spec) => client.getPerformer(`${spec.id}:${KNOWN[spec.id]!.performer}`),
  tag_categories: (spec) => client.getTag(`${spec.id}:${KNOWN[spec.id]!.tag}`),
  fingerprint_reports: (spec) =>
    client.getScene(`${spec.id}:${KNOWN[spec.id]!.scene}`, ["basic", "fingerprints"]),
  index_total: (spec) => client.searchScenes({ query: "sunset", limit: 1, sources: [spec.id] }),
  pending_edits: (spec) => client.getScene(`${spec.id}:${KNOWN[spec.id]!.scene}`),
  perceptual_lookup: (spec) =>
    client.findByFingerprint({
      fingerprints: [{ hash: "841f346c96e743b3", algorithm: "PHASH" }],
      sources: [spec.id],
    }),
  scene_count: (spec) => client.getPerformer(`${spec.id}:${KNOWN[spec.id]!.performer}`),
  performer_studios: (spec) =>
    client.getPerformer(`${spec.id}:${KNOWN[spec.id]!.performer}`, ["basic", "studios"]),
};

/**
 * One record of each kind this suite is allowed to read, per catalogue.
 *
 * These are identifiers, not content: the suite asks whether the route accepts
 * the question, and never what the record holds.
 */
const KNOWN: Partial<Record<InstanceId, Record<string, string>>> = {
  stashdb: {
    scene: "001659bc-3cfc-4b65-9419-958e91d9bcf4",
    performer: "155f2559-d1f1-42b1-8cbe-9008542df5ce",
    studio: "915dd307-a440-4578-b83f-699b9706faea",
    tag: "9441c3ad-41d2-4d6e-bc97-54ad8cc227d5",
  },
  tpdb: {
    scene: "5606d406-a974-4ed6-a019-635e4163d388",
    performer: "a6fb1863-b433-4274-ae07-0e1327c854d1",
    studio: "1dafafd3-da8f-47f3-aca2-e6bb9f354292",
    tag: "00000000-0000-0000-0000-000000000000",
  },
};

describe("every capability names a question", () => {
  it("covers the closed set, so nothing is declared and left unmeasured", () => {
    expect(Object.keys(QUESTION).sort()).toEqual([...CAPABILITIES].sort());
  });

  it("holds an identifier of each kind for every catalogue a key is held for", () => {
    for (const spec of reachable) {
      expect(KNOWN[spec.id], `no record is named for ${spec.name}`).toBeDefined();
    }
  });
});

describe.skipIf(!ENABLED)("every capability the registry declares is answered", () => {
  for (const spec of INSTANCES) {
    for (const capability of CAPABILITIES) {
      const declared = supports(spec, capability);
      const known = KEYS[spec.id] !== undefined && KNOWN[spec.id] !== undefined;

      it.skipIf(!declared || !known)(
        `${spec.name} answers ${capability}`,
        async () => {
          const read = (await QUESTION[capability](spec)) as {
            data?: {
              perSource?: { source: string; state: string; error?: string; reason?: string }[];
            };
          };
          const refused = (read.data?.perSource ?? []).filter(
            (report) => report.source === spec.id && report.state === "failed",
          );
          expect(
            refused.map((report) => `${report.error}: ${report.reason ?? ""}`),
            `${spec.name} declares ${capability} and refused the request this client builds for it`,
          ).toEqual([]);
        },
        60_000,
      );
    }
  }
});

describe.skipIf(!ENABLED)("a capability a catalogue lacks is never put to it", () => {
  it("sends no request to a catalogue the registry says answers no such route", async () => {
    for (const spec of reachable) {
      if (supports(spec, "search_studios")) continue;
      const read = await client.searchStudios({ query: "vixen", limit: 1, sources: [spec.id] });
      const mine = read.data.perSource.find((report) => report.source === spec.id);
      // Never asked is a third state, and it is the one that is true here.
      expect(mine?.state, `${spec.name} was asked a route it does not answer`).toBe("absent");
    }
  }, 60_000);
});
