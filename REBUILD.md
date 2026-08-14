# The surface this server publishes, and what it is built on

This document is the specification the implementation is written against. Every
fact in it marked **measured** was read from a catalogue by introspection or by
a real request, with the date it was read. Nothing here is inferred from what
the published stash-box software is assumed to do: that inference is what put a
false limitation about a catalogue into every answer this server gave.

## The rule that governs everything below

**A server never states anything the data does not carry.** Four readings of it
decide every design choice in this document.

- A failure is never rendered as an emptiness. A catalogue that failed, one that
  was never asked, and one that looked and found nothing are three states.
- A null is never rendered as a value. A count nobody published is unknown, and
  on a scale that starts at zero the two are indistinguishable.
- A counter never lies about what it counts. Counts from two catalogues are
  never added: the corpora overlap and the overlap is unknown.
- A rule announced and not applied is worse than none.

## What was measured, and when

Read on 2026-08-13 by GraphQL introspection and by real requests.

### The routes each catalogue answers

|                          | StashDB                                            | ThePornDB                |
| ------------------------ | -------------------------------------------------- | ------------------------ |
| Routes on the query type | 36                                                 | 11                       |
| Text search, scenes      | `searchScenes(term)`                               | `searchScene(term)`      |
| Text search, performers  | `searchPerformers(term)`                           | `searchPerformer(term)`  |
| Faceted, scenes          | `queryScenes(input)`                               | `queryScenes(input)`     |
| Faceted, performers      | `queryPerformers(input)`                           | `queryPerformers(input)` |
| Faceted, studios         | `queryStudios(input)`                              | absent                   |
| Faceted, tags            | `queryTags(input)`                                 | `queryTags(input)`       |
| Text search, studios     | `searchStudio(term)`                               | absent                   |
| Text search, tags        | `searchTag(term)`                                  | absent                   |
| One record               | `findScene` `findPerformer` `findStudio` `findTag` | the same four            |
| By fingerprint           | `findScenesBySceneFingerprints`                    | the same                 |

**ThePornDB answers searches.** Its route names are singular where StashDB
writes them plural, and its faceted input requires `sort` and `direction`. A
request written in StashDB's spelling is refused, which is what produced the
claim that this catalogue searches nothing.

### How the filters combine

Measured on StashDB with `queryScenes`:

| Question                    | Rows the index holds |
| --------------------------- | -------------------- |
| `title: "sunset"`           | 281                  |
| `studios: INCLUDES [Vixen]` | 633                  |
| both together               | **0**                |

The filters are **ANDed**. A union would have answered about 914.

Within one list, the modifier decides:

| Question              | Rows                    |
| --------------------- | ----------------------- |
| tag A alone           | 48                      |
| tag B alone           | 5                       |
| `INCLUDES [A, B]`     | **53**, the union       |
| `INCLUDES_ALL [A, B]` | **0**, the intersection |

The text route behaves the other way: its words are **ORed**. `"coucher"`
answers 7, and a sentence of seven words answers 96,305. Writing words and
typed filters together silently swaps one logic for the other, which is why
this server refuses the two together.

### The comparisons a criterion takes

`CriterionModifier` declares `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`,
`LESS_THAN`, `IS_NULL`, `NOT_NULL`, `INCLUDES_ALL`, `INCLUDES`, `EXCLUDES`.

There is **no `BETWEEN`**. A date field carries one comparison, so no catalogue
answers a range in one request, and this server publishes no argument pair that
would promise one.

### The filters each faceted input declares

- `SceneQueryInput`: text, title, url, code, date, production_date, studios,
  parentStudio, tags, performers, alias, fingerprints, favorites,
  has_fingerprint_submissions, page, per_page, direction, sort.
- `PerformerQueryInput`: names, name, alias, disambiguation, gender, url,
  birthdate, deathdate, birth_year, age, ethnicity, country, eye_color,
  hair_color, height, cup_size, band_size, waist_size, hip_size, breast_type,
  career_start_year, career_end_year, tattoos, piercings, is_favorite,
  performed_with, studio_id, page, per_page, direction, sort.
- `StudioQueryInput`: name, names, url, parent, has_parent, is_favorite, page,
  per_page, direction, sort.
- `TagQueryInput`: text, names, name, category_id, page, per_page, direction,
  sort.

### What joins two records across catalogues

Each catalogue publishes, among a record's links and under a category it keeps
called **Other stash-boxes**, the address of the same record on another
catalogue, and that address carries the target UUID. Measured, and reciprocal:
StashDB's record for one performer links to `theporndb.net/performers/a6fb…`,
and ThePornDB's record for that performer links back to
`stashdb.org/performers/155f…`.

**That link is the only join this server follows for a performer, a studio or a
tag.** A shared name is never a join: two records of one name are the same
person only where an editor wrote that they are.

For a scene there is a second join, stronger than a link: an **MD5 or an
OSHASH** names the bytes of a file, so two records carrying one exact hash
describe one file. A PHASH states a likeness and joins nothing.

## The surface

### The shapes, written once and referenced

A published schema states each of these once and refers to it, rather than
inlining it per tool. Inlining is what made the tool list cost about 25,000
tokens per session, more than half of it the same description strings repeated.

**`Row`** — what a search answers with. `id` written `instance:uuid`, `source`,
`source_url`, `status` (`established` | `merged` | `deleted`), and the three to
five fields that identify the record. Never consolidated.

**`Card`** — what a record route answers with, consolidated across the
catalogues that hold the record.

- A scalar is `{ value, agreed_by: [...], disagreed?: [{ source, value }] }`.
  Where the catalogues disagree, the preferred reading is the value and the
  others are published beside it. Nothing is dropped.
- A list is the union, each entry carrying `published_by: [...]`.
- `held_by: [{ source, id, state }]` names every catalogue asked, with the
  identifier the record carries there and whether that catalogue answered.

**`PerSource`** — what each catalogue did with the question: its state, what it
answered with, what its index holds, what it could not receive, and why it was
not asked where it was not.

### The ten tools

| Tool                  | Arguments                                                                                                                                                                                                                                   | Answers with                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_sources`         | none                                                                                                                                                                                                                                        | `sources[]`: `id`, `name`, `web_url`, `key_configured`, `env_var`, `answers[]`, `publishes[]`, `lacks[]`. Reaches no catalogue.                                           |
| `search_scenes`       | `query` (exclusive) · `title` `code` `alias` · `date` + `date_compare` (`on`\|`before`\|`after`) · `performer_ids[]` `studio_ids[]` `parent_studio_id` `tag_ids[]` · `match` (`all`\|`any`) · `sort` `direction` `page` `limit` `sources[]` | `results[]` of `Row` + `title` `studio` `date` `code` `performers[]` `tags[]` · `per_source[]` · `window` · `ordering` · `notes[]`                                        |
| `search_performers`   | `query` (exclusive) · `name` `alias` `disambiguation` · `gender` `country` `ethnicity` · `birth_year` `career_start_year` `career_end_year` · `performed_with` `studio_id` · `sort` `direction` `page` `limit` `sources[]`                  | `results[]` of `Row` + `name` `disambiguation` `aliases[]` `gender` `country` `birth_date` · `per_source[]` · `window` · `ordering` · `notes[]`                           |
| `search_studios`      | `query` (exclusive) · `name` · `parent_id` `has_parent` · `sort` `direction` `page` `limit` `sources[]`                                                                                                                                     | `results[]` of `Row` + `name` `parent` · `per_source[]` · `window` · `notes[]`                                                                                            |
| `search_tags`         | `query` (exclusive) · `name` · `category_id` · `sort` `direction` `page` `limit` `sources[]`                                                                                                                                                | `results[]` of `Row` + `name` `category` `description` · `per_source[]` · `window` · `notes[]`                                                                            |
| `get_scene`           | `id` · `sections[]` (`basic`\|`fingerprints`\|`images`) · `sources[]` · `prefer[]`                                                                                                                                                          | `Card`: `title` `code` `date` `duration` `director` `studio` `performers[]` `tags[]` `urls[]`, and the sections asked for                                                 |
| `get_performer`       | `id` · `sections[]` (`basic`\|`appearance`\|`images`\|`studios`) · `sources[]` · `prefer[]`                                                                                                                                                 | `Card`: `name` `disambiguation` `aliases[]` `gender` `country` `birth_date` `death_date` `career` `urls[]`, the sections asked for, and `scene_count[]` **per catalogue** |
| `get_studio`          | `id` · `sources[]` · `prefer[]`                                                                                                                                                                                                             | `Card`: `name` `parent` `aliases[]` `urls[]`. Measured: a studio declares no count of the scenes indexed on it and no list of open edits, so neither is published                                                                                              |
| `get_tag`             | `id` · `sources[]` · `prefer[]`                                                                                                                                                                                                             | `Card`: `name` `aliases[]` `category` `description`                                                                                                                       |
| `find_by_fingerprint` | `fingerprints[]` (`{hash, algorithm}`, 1 to 25) · `sources[]` · `prefer[]`                                                                                                                                                                  | `matches[]` of `{ scene: Card, algorithm, match_kind, fingerprint }` · `asked[]` · `unattributed` · `per_source[]`                                                        |

### The four rules the surface applies

**A text search and a faceted search are exclusive.** Writing `query` beside any
typed filter is refused, naming both. The two combine their terms in opposite
ways, and answering one while reporting the other as unreceived hands a caller
rows narrowed by a logic they did not choose.

**A date carries one comparison.** `date` with `date_compare` mirrors what a
catalogue takes. A pair of bounds would promise a range no catalogue answers,
and an inverted range becomes impossible to write.

**A search answers with identifiers; a record route consolidates.** There is no
boolean: `sources: ["stashdb"]` reads one catalogue, and leaving `sources` out
consolidates across every catalogue that holds the record. Consolidating a page
of rows would run one request per row per catalogue.

**Chaining is the way through.** `search_tags` → `tag_ids` → `search_scenes` →
`id` → `get_scene`. A performer's scenes are `search_scenes(performer_ids)`,
which pages and filters, so no record route carries a block that runs a search
of its own.

### Preference, where two catalogues disagree

The order the registry declares, overridable per call with `prefer`. Every card
states the policy that was applied, and a field where the sources disagree
carries the alternatives. Where the preferred catalogue failed, the fallback is
announced rather than performed in silence.

**Counts are never merged.** `scene_count` is a list, one entry per catalogue,
each naming the catalogue that published it and saying so where a catalogue
publishes none.

## What the implementation rests on

The seam, first: `src/tools/*` imports the MCP SDK and `src/stashbox/*` never
does, so the lower layer is publishable as a library with its pacing, its store
and its error taxonomy and no protocol attached.

Then the six error codes, the transport with its pacing floor and its retries,
the identifier grammar, and the primitives that keep a catalogue's own words
from forging a line this server writes. Each of those is read by a suite that
drives it directly rather than through a tool that happens to exercise it.

## What the tests establish before any of it is written

The suite is written first and against this document, not against an
implementation. Its expected values come from real requests to the catalogues,
captured with the date they were read, so a test states what a catalogue
actually answered rather than what the code happened to produce.

Three layers, and the first two run without a network:

1. **The contract.** What each tool declares, what it refuses, what its answer
   is shaped like, and what every answer states about what it does not
   establish.
2. **The reading.** What a record is allowed to say once a catalogue's answer
   has been read into it, driven by hand-built answers, including every way an
   answer can be unreadable.
3. **In direct.** One question per **narrowing**, not per route, because a
   narrowing that travels differently from its siblings is where a request that
   no catalogue takes hides. Every capability `get_sources` declares is put to
   the catalogue that declares it, so a claim about a catalogue cannot outlive
   one night.
