/**
 * What search_scenes says it was asked, on the full-text path.
 *
 * The tool publishes two exclusive paths: a `query` runs the full-text search,
 * and the typed arguments reach the faceted one. The description promises that
 * giving `query` reports every typed argument as not received, so the promise is
 * asserted here on the report the client builds rather than on the prose a
 * renderer writes from it.
 *
 * No request leaves this file: a stub transport stands in for the catalogues,
 * so the answer is decided by what the client sends and never by a network.
 */

import { describe, expect, it } from "vitest";
import { StashboxClient } from "../../src/stashbox/client.js";
import type { SourceReport } from "../../src/types.js";

type Transport = { request: <T>(spec: unknown, apiKey: string, body: unknown) => Promise<T> };

/**
 * A transport that answers every catalogue with the shape its schema declares,
 * carrying no rows. A catalogue that looked and found nothing has answered,
 * which is the state whose report the assertions below read. A payload without
 * that shape would be a catalogue this client could not read, which is a
 * failure and a different report.
 */
function emptyTransport(): Transport {
  return {
    request: async <T>(): Promise<T> =>
      ({
        searchScenes: { count: 0, scenes: [] },
        queryScenes: { count: 0, scenes: [] },
        searchPerformers: { count: 0, performers: [] },
        queryPerformers: { count: 0, performers: [] },
      }) as T,
  };
}

function clientWithKeys(): StashboxClient {
  return new StashboxClient({
    keys: { stashdb: "test-key", fansdb: "test-key", pmv: "test-key" },
    transport: emptyTransport(),
    minIntervalMs: 0,
  } as ConstructorParameters<typeof StashboxClient>[0]);
}

function answering(reports: readonly SourceReport[]): SourceReport[] {
  return reports.filter((report) => report.state === "answered");
}

describe("searchScenes on the full-text path", () => {
  it("says nothing about 'match' where no list of identifiers was sent", async () => {
    // `match` reads a list of identifiers. Reporting it as not received where no
    // list was written states that the rows carry one of a set nobody named.
    const read = await clientWithKeys().searchScenes({
      query: "midnight garden",
      match: "any",
      page: 1,
      limit: 5,
    } as Parameters<StashboxClient["searchScenes"]>[0]);

    const answered = answering(read.data.perSource);
    expect(answered.length).toBeGreaterThan(0);
    for (const report of answered) {
      expect(report.narrowingsNotReceived ?? []).not.toContain("match");
    }
  });

  it("reports 'match' as not received even when the typed arguments travel with it", async () => {
    const read = await clientWithKeys().searchScenes({
      query: "midnight garden",
      match: "all",
      performerIds: ["stashdb:94ef9c17-82c6-48b0-8dcc-063b69231960"],
      page: 1,
      limit: 5,
    } as Parameters<StashboxClient["searchScenes"]>[0]);

    const answered = answering(read.data.perSource);
    expect(answered.length).toBeGreaterThan(0);
    for (const report of answered) {
      const notReceived = report.narrowingsNotReceived ?? [];
      expect(notReceived).toContain("match");
      expect(notReceived).toContain("performer_ids");
    }
  });
});
