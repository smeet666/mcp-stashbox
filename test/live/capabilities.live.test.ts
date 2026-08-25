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
 * **A claim nothing can reach is a claim nothing can refute.** A key is held for
 * two of these catalogues, so only those two can be asked a question. The other
 * three are read the way their rows say they were read: GraphQL introspection
 * needs no key, and every route, record field and result shape the registry
 * names for them is resolved against the schema they publish. A route that
 * vanishes from a catalogue's schema fails here, whether or not anybody holds a
 * key for it.
 *
 * Where a case cannot run, it says so in its own name and in the note it skips
 * with, since a run reporting a count of silent skips beside a count of passes
 * reads as coverage.
 *
 * The assertion is about acceptance, never about content. What a catalogue holds
 * belongs to the people who edit it, so pinning an answer would produce failures
 * that say nothing about this client.
 */

import process from "node:process";
import { describe, expect, it } from "vitest";

import { DEFAULT_USER_AGENT } from "../../src/config.js";
import { StashboxClient } from "../../src/stashbox/client.js";
import { CAPABILITIES, INSTANCES, supports } from "../../src/stashbox/instances.js";
import type { Capability, InstanceId, InstanceSpec } from "../../src/stashbox/instances.js";

const KEYS: Partial<Record<InstanceId, string>> = {
  ...(process.env.STASHBOX_STASHDB_KEY ? { stashdb: process.env.STASHBOX_STASHDB_KEY } : {}),
  ...(process.env.STASHBOX_TPDB_KEY ? { tpdb: process.env.STASHBOX_TPDB_KEY } : {}),
};

const ENABLED = process.env.STASHBOX_LIVE === "1";
const client = new StashboxClient({ keys: KEYS });

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
    // Read from the catalogue itself with findTag on a name it holds, since a
    // placeholder identifier reads as a catalogue refusing a route it answers.
    tag: "d2e7654f-daa9-45d4-9382-eca506a98ff8",
  },
};

/**
 * What this run put evidence behind, by catalogue and by kind of evidence.
 *
 * The last case in the file reads both, so a capability no case reached is
 * named at the end of the run instead of passing unnoticed among the skips.
 */
const SEEN_IN_SCHEMA = new Map<InstanceId, Set<Capability>>();
const SEEN_ANSWERING = new Map<InstanceId, Set<Capability>>();

function record(
  into: Map<InstanceId, Set<Capability>>,
  spec: InstanceSpec,
  capability: Capability,
): void {
  const seen = into.get(spec.id) ?? new Set<Capability>();
  seen.add(capability);
  into.set(spec.id, seen);
}

/* ------------------------------------------- the schema a catalogue publishes */

/** A field of a type, with the name of the type it leads to. */
interface Field {
  name: string;
  /** The named type under any wrappers, which is where a path continues. */
  target: string | null;
  /** Whether the answer is a list of that type rather than one of it. */
  isList: boolean;
}

interface Schema {
  queryType: string;
  fieldsByType: Map<string, Map<string, Field>>;
  enumValues: Map<string, string[]>;
}

const INTROSPECTION = `query {
  __schema {
    queryType { name }
    types {
      name
      enumValues { name }
      fields {
        name
        type { ...ref }
      }
    }
  }
}
fragment ref on __Type {
  kind
  name
  ofType { kind name ofType { kind name ofType { kind name } } }
}`;

interface TypeRef {
  kind: string;
  name: string | null;
  ofType?: TypeRef | null;
}

/** The named type a reference leads to, and whether a list stands on the way. */
function unwrap(ref: TypeRef): { target: string | null; isList: boolean } {
  let isList = false;
  let at: TypeRef | null | undefined = ref;
  while (at && (at.kind === "NON_NULL" || at.kind === "LIST")) {
    if (at.kind === "LIST") {
      isList = true;
    }
    at = at.ofType;
  }
  return { target: at?.name ?? null, isList };
}

/**
 * The schema one catalogue publishes, read once per run.
 *
 * Introspection is open on the endpoints this registry names, and one of them
 * answers it only to a request carrying a key. A catalogue whose schema cannot
 * be read is reported as unread, never as a catalogue missing a route.
 */
const SCHEMAS = new Map<InstanceId, Promise<Schema | string>>();

function schemaOf(spec: InstanceSpec): Promise<Schema | string> {
  const held = SCHEMAS.get(spec.id);
  if (held) {
    return held;
  }
  const reading = readSchema(spec);
  SCHEMAS.set(spec.id, reading);
  return reading;
}

async function readSchema(spec: InstanceSpec): Promise<Schema | string> {
  const key = KEYS[spec.id];
  try {
    const answer = await fetch(spec.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": DEFAULT_USER_AGENT,
        ...(key ? { ApiKey: key } : {}),
      },
      body: JSON.stringify({ query: INTROSPECTION }),
      signal: AbortSignal.timeout(45_000),
    });
    const body = await answer.text();
    if (!answer.ok) {
      return `it answered ${answer.status} to an introspection query`;
    }
    const parsed = JSON.parse(body) as {
      data?: {
        __schema: {
          queryType: { name: string };
          types: {
            name: string;
            enumValues?: { name: string }[] | null;
            fields?: unknown[] | null;
          }[];
        };
      };
    };
    if (!parsed.data) {
      return "it answered an introspection query with no schema in it";
    }
    const fieldsByType = new Map<string, Map<string, Field>>();
    const enumValues = new Map<string, string[]>();
    for (const type of parsed.data.__schema.types) {
      const fields = (type.fields ?? []) as { name: string; type: TypeRef }[];
      fieldsByType.set(
        type.name,
        new Map(fields.map((one) => [one.name, { name: one.name, ...unwrap(one.type) }])),
      );
      if (type.enumValues) {
        enumValues.set(
          type.name,
          type.enumValues.map((one) => one.name),
        );
      }
    }
    return { queryType: parsed.data.__schema.queryType.name, fieldsByType, enumValues };
  } catch (cause) {
    return `its endpoint could not be read: ${String(cause)}`;
  }
}

/**
 * The field a dotted route names, walked from the query type.
 *
 * A route is either a field of the query type or a path through the record type
 * it answers, which is how a capability that is a field rather than a route is
 * named. A segment that leads nowhere gives back the path as far as it went, so
 * a failure says which hop broke.
 */
function resolve(schema: Schema, path: string): { field: Field | undefined; reached: string } {
  let type: string | null = schema.queryType;
  let field: Field | undefined;
  const walked: string[] = [];
  for (const segment of path.split(".")) {
    if (type === null) {
      return { field: undefined, reached: walked.join(".") };
    }
    field = schema.fieldsByType.get(type)?.get(segment);
    if (!field) {
      return { field: undefined, reached: walked.join(".") };
    }
    walked.push(segment);
    type = field.target;
  }
  return { field, reached: walked.join(".") };
}

describe("every capability names a question", () => {
  it("covers the closed set, so nothing is declared and left unmeasured", () => {
    expect(Object.keys(QUESTION).sort()).toEqual([...CAPABILITIES].sort());
  });

  it("names records of each kind for every catalogue the registry calls measured answering", () => {
    // A row saying its capabilities were put to the catalogue and answered is
    // a row this suite has to be able to put them to. Flipped to that evidence
    // with no record named here, a catalogue would publish the stronger claim
    // and go unasked.
    for (const spec of INSTANCES.filter((one) => one.evidence === "measured_answering")) {
      expect(
        KNOWN[spec.id],
        `${spec.name} publishes its table as measured answering, and no record is named to ask it with`,
      ).toBeDefined();
    }
  });
});

describe.skipIf(!ENABLED)(
  "every capability the registry declares is in the catalogue's schema",
  () => {
    for (const spec of INSTANCES) {
      for (const capability of CAPABILITIES) {
        if (!supports(spec, capability)) {
          continue;
        }
        it(`${spec.name} declares ${capability}`, async (ctx) => {
          const schema = await schemaOf(spec);
          if (typeof schema === "string") {
            const since: string = schema;
            ctx.skip(
              `UNVERIFIED: ${spec.name} declares ${capability} and its schema went unread here, since ${since}`,
            );
            return;
          }
          const route = spec.routes[capability]!;
          const { field, reached } = resolve(schema, route);
          expect(
            field,
            `${spec.name} declares ${capability} on ${route}, and its schema resolves that path only as far as ${reached || "the query type"}`,
          ).toBeDefined();
          record(SEEN_IN_SCHEMA, spec, capability);
        }, 60_000);
      }
    }

    for (const spec of INSTANCES) {
      for (const [capability, shape] of Object.entries(spec.answersWith) as [
        Capability,
        "list" | "page",
      ][]) {
        it(`${spec.name} declares ${capability} answering with a ${shape}`, async (ctx) => {
          const schema = await schemaOf(spec);
          if (typeof schema === "string") {
            const since: string = schema;
            ctx.skip(
              `UNVERIFIED: ${spec.name} declares the shape of ${capability} and its schema went unread here, since ${since}`,
            );
            return;
          }
          const route = spec.routes[capability]!;
          const { field } = resolve(schema, route);
          expect(
            field,
            `${spec.name} names ${route} for ${capability} and declares no such route`,
          ).toBeDefined();
          // A page carries the rows under a key of its own beside a count of
          // what the index holds; a list is the rows and nothing else. Read as
          // the other, a request fails validation before a row is seen.
          const counts = field?.target
            ? (schema.fieldsByType.get(field.target)?.has("count") ?? false)
            : false;
          expect(
            { isList: field?.isList ?? false, counts },
            `${spec.name} answers ${capability} in a shape its registry entry does not name`,
          ).toEqual(
            shape === "page" ? { isList: false, counts: true } : { isList: true, counts: false },
          );
        }, 60_000);
      }
    }

    for (const spec of INSTANCES) {
      if (!supports(spec, "perceptual_lookup")) {
        continue;
      }
      it(`${spec.name} declares the perceptual algorithm its fingerprint route searches`, async (ctx) => {
        const schema = await schemaOf(spec);
        if (typeof schema === "string") {
          const since: string = schema;
          ctx.skip(
            `UNVERIFIED: ${spec.name} declares perceptual_lookup and its schema went unread here, since ${since}`,
          );
          return;
        }
        // The route is the one exact hashes travel on, so the capability is
        // the algorithm rather than the route: a catalogue declaring no
        // perceptual algorithm searches none, whatever the route accepts.
        expect(
          schema.enumValues.get("FingerprintAlgorithm") ?? [],
          `${spec.name} declares a fingerprint route that names no perceptual algorithm`,
        ).toContain("PHASH");
      }, 60_000);
    }
  },
);

/**
 * Why this run cannot check a catalogue, or undefined when it can.
 *
 * A key this install does not hold and a suite that names no record for the
 * catalogue are two different things to do about, and neither is evidence
 * about what the catalogue answers.
 */
function whyThisCatalogueCannotBeChecked(spec: InstanceSpec): string | undefined {
  if (KEYS[spec.id] === undefined) {
    return `no key is held for it in this run, so set ${spec.envVar} to check it`;
  }
  if (KNOWN[spec.id] === undefined) {
    return "no record of each kind is named for it in this suite";
  }
  return undefined;
}

describe.skipIf(!ENABLED)("every capability the registry calls answered is answered", () => {
  for (const spec of INSTANCES.filter((one) => one.evidence === "measured_answering")) {
    const unreachable = whyThisCatalogueCannotBeChecked(spec);

    for (const capability of CAPABILITIES) {
      if (!supports(spec, capability)) {
        continue;
      }
      it(unreachable
        ? `${spec.name} answers ${capability} — UNVERIFIED in this run`
        : `${spec.name} answers ${capability}`, async (ctx) => {
        if (unreachable) {
          ctx.skip(
            `UNVERIFIED: ${spec.name} publishes ${capability} as measured answering, and no request was put to it here, since ${unreachable}`,
          );
          return;
        }
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
        record(SEEN_ANSWERING, spec, capability);
      }, 60_000);
    }
  }
});

describe.skipIf(!ENABLED)("a capability a catalogue lacks is never put to it", () => {
  it("sends no request to a catalogue the registry says answers no such route", async () => {
    for (const spec of INSTANCES.filter((one) => KEYS[one.id] !== undefined)) {
      if (supports(spec, "search_studios")) {
        continue;
      }
      const read = await client.searchStudios({ query: "vixen", limit: 1, sources: [spec.id] });
      const mine = read.data.perSource.find((report) => report.source === spec.id);
      // Never asked is a third state, and it is the one that is true here.
      expect(mine?.state, `${spec.name} was asked a route it does not answer`).toBe("absent");
    }
  }, 60_000);
});

/**
 * Every capability the registry publishes that this run put nothing to.
 *
 * A claim whose schema was read and whose capability nothing reached has no
 * excuse; one on a catalogue whose schema could not be read is a silence this
 * run explains rather than a defect.
 */
function claimsNothingReached(unreadIds: ReadonlySet<InstanceId>): {
  missing: string[];
  unanswered: string[];
} {
  const missing: string[] = [];
  const unanswered: string[] = [];

  for (const spec of INSTANCES) {
    for (const capability of CAPABILITIES) {
      if (!supports(spec, capability)) {
        continue;
      }
      if (!(SEEN_IN_SCHEMA.get(spec.id)?.has(capability) || unreadIds.has(spec.id))) {
        missing.push(`${spec.name}: ${capability}`);
      }
      if (spec.evidence === "measured_answering" && !SEEN_ANSWERING.get(spec.id)?.has(capability)) {
        unanswered.push(`${spec.name}: ${capability}`);
      }
    }
  }

  return { missing, unanswered };
}

describe.skipIf(!ENABLED)("what this run left unchecked", () => {
  it("names every claim this run reached, and every claim it did not", async (ctx) => {
    // Vitest runs the cases above before this one, so what they recorded is
    // what this run actually reached. A claim nothing reached is the state
    // that let a false claim about a catalogue stand for several versions, and
    // it is named here whether it went unreached through a defect or through a
    // catalogue this run could not read.
    const unread: string[] = [];
    const unreadIds = new Set<InstanceId>();
    for (const spec of INSTANCES) {
      const schema = await schemaOf(spec);
      if (typeof schema !== "string") {
        continue;
      }
      const since: string = schema;
      unread.push(`${spec.name}, since ${since}`);
      unreadIds.add(spec.id);
    }

    const { missing, unanswered } = claimsNothingReached(unreadIds);

    // A capability of a catalogue this run read the schema of has no excuse
    // for going unchecked, so it is a failure rather than a silence.
    expect(missing, "these claims were published and nothing in this run reached them").toEqual([]);

    if (unread.length > 0 || unanswered.length > 0) {
      ctx.skip(
        [
          "UNVERIFIED in this run:",
          ...unread.map((one) => `  no schema was read from ${one}`),
          ...unanswered.map(
            (one) =>
              `  published as measured answering, and no request was put to it here — ${one}`,
          ),
        ].join("\n"),
      );
    }
  }, 60_000);
});
