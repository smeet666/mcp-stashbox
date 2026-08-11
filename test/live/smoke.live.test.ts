import { describe, it, expect } from "vitest";

import { StashboxClient } from "../../src/stashbox/client.js";
import type { InstanceId } from "../../src/stashbox/instances.js";

/**
 * One request per route, against the catalogues themselves.
 *
 * This suite exists to notice the day a catalogue changes how it answers, which
 * no generated fixture can tell us. It therefore asserts the SHAPE of an answer
 * and never its contents: a record's title, its count and its dates belong to
 * people who edit them, and pinning any of those would produce a failure that
 * says nothing about this client.
 *
 * It runs behind an environment variable, and skips itself entirely when no key
 * is configured, so an ordinary `npm test` never reaches a catalogue.
 */

const KEYS: Partial<Record<InstanceId, string>> = {
  ...(process.env.STASHBOX_STASHDB_KEY ? { stashdb: process.env.STASHBOX_STASHDB_KEY } : {}),
  ...(process.env.STASHBOX_TPDB_KEY ? { tpdb: process.env.STASHBOX_TPDB_KEY } : {}),
  ...(process.env.STASHBOX_FANSDB_KEY ? { fansdb: process.env.STASHBOX_FANSDB_KEY } : {}),
  ...(process.env.STASHBOX_PMV_KEY ? { pmv: process.env.STASHBOX_PMV_KEY } : {}),
  ...(process.env.STASHBOX_JAVSTASH_KEY ? { javstash: process.env.STASHBOX_JAVSTASH_KEY } : {}),
};

const ENABLED = process.env.STASHBOX_LIVE === "1" && Object.keys(KEYS).length > 0;

const client = new StashboxClient({ keys: KEYS });

describe.skipIf(!ENABLED)("live", () => {
  it("searches scenes and reports what became of every catalogue", async () => {
    const read = await client.searchScenes({ query: "harbour", limit: 3 });

    expect(Array.isArray(read.data.rows)).toBe(true);
    expect(read.data.ordering).toBeTruthy();

    // Every catalogue this client knows reaches the report, whether it answered,
    // failed, or was never asked. A catalogue missing from it entirely is the
    // defect this whole server is built to avoid.
    const reported = new Set(read.data.perSource.map((entry) => entry.source));
    expect(reported.size).toBeGreaterThanOrEqual(Object.keys(KEYS).length);
    for (const entry of read.data.perSource) {
      expect(["answered", "failed", "absent"]).toContain(entry.state);
      if (entry.state === "absent") expect(entry.reason).toBeTruthy();
      if (entry.state === "failed") expect(entry.moment).toBeTruthy();
    }
  });

  it("searches performers", async () => {
    const read = await client.searchPerformers({ query: "nordsken", limit: 3 });

    expect(Array.isArray(read.data.rows)).toBe(true);
    for (const row of read.data.rows) {
      expect(row.id).toMatch(/^[a-z]+:[0-9a-f-]{36}$/);
      expect(row.sourceUrl).toMatch(/^https:\/\//);
      expect(row.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("reads one scene, and what it reads round-trips through its own identifier", async () => {
    const found = await client.searchScenes({ limit: 1, sort: "updated", direction: "desc" });
    const first = found.data.rows[0];
    if (!first) return;

    const read = await client.getScene(first.id, ["basic", "fingerprints"]);

    expect(read.data.id).toBe(first.id);
    expect(read.data.source).toBe(first.source);
    expect(["established", "deleted", "merged"]).toContain(read.data.status);
    // A date that arrives at a precision this client cannot read comes back null,
    // so anything present carries one of the three it declares.
    if (read.data.releaseDate) {
      expect(["day", "month", "year"]).toContain(read.data.releaseDate.precision);
    }
    // A quantity on a scale that cannot hold zero is null when it arrives as one.
    if (read.data.durationSeconds !== null) expect(read.data.durationSeconds).toBeGreaterThan(0);
  });

  it("reads one performer, with the appearance section", async () => {
    const found = await client.searchPerformers({ limit: 1, sort: "updated", direction: "desc" });
    const first = found.data.rows[0];
    if (!first) return;

    const read = await client.getPerformer(first.id, ["basic", "appearance"]);

    expect(read.data.id).toBe(first.id);
    if (read.data.status === "merged") {
      // A folded record answers, names its successor, and states no count.
      expect(read.data.mergedInto).toBeTruthy();
      expect(read.data.sceneCount).toBeNull();
    } else {
      expect(read.data.appearance).toBeDefined();
      if (read.data.appearance?.heightCm !== null && read.data.appearance !== undefined) {
        expect(read.data.appearance.heightCm).toBeGreaterThan(0);
      }
    }
  });

  it("looks a scene up by a fingerprint it carries", async () => {
    const found = await client.searchScenes({ limit: 1, sort: "created", direction: "desc" });
    const first = found.data.rows[0];
    if (!first) return;

    const scene = await client.getScene(first.id, ["basic", "fingerprints"]);
    const held = scene.data.fingerprints?.[0];
    if (!held) return;

    const read = await client.findByFingerprint({
      fingerprints: [{ hash: held.hash, algorithm: held.algorithm }],
    });

    for (const match of read.data.matches) {
      expect(match.matchKind).toBe(
        match.algorithm === "PHASH" ? "perceptual_similarity" : "exact_file",
      );
      // A catalogue that counts no reports states an unknown contest, and one
      // that counts them states a known one. Neither ever states the other.
      if (match.fingerprint?.reports === null) expect(match.fingerprint.contested).toBeNull();
    }
  });

  it("refuses an identifier no catalogue could have minted", async () => {
    await expect(client.getScene("stashdb:not-a-uuid")).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("answers an identifier the catalogue has never minted as an absence", async () => {
    const configured = client.configured[0];
    if (!configured) return;

    await expect(
      client.getScene(`${configured}:00000000-0000-4000-8000-000000000000`),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
