# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-11

First release.

### Added

- `search_scenes` and `search_performers`, asking every configured catalogue at
  once and naming what each one answered, failed at, or was never asked. A
  catalogue's own count of what its index holds travels beside the rows returned,
  since the two are different numbers.
- `get_scene` and `get_performer`, with opt-in sections so a record's heaviest
  blocks are loaded only when they are wanted. An identifier folded into another
  answers as a marker naming its successor.
- `find_by_fingerprint`, which takes every hash held for one file in a single
  request and states which kind of claim each match makes: the same file for MD5
  and OSHASH, images that resemble each other for PHASH.
- Five catalogues, four running the published server and one reimplementing its
  interface. The reimplementation answers a smaller surface and types its
  narrowings differently, and every answer holding its rows says which of them it
  could not receive.
- A published `./client` entry point carrying the pacing, the store and the error
  taxonomy with no protocol attached. The floor on pacing holds through it.
- An output schema on every tool, declared as a choice where a record can answer
  either as itself or as a marker.
- A live suite behind `STASHBOX_LIVE`, making one request per route and asserting
  the shape of an answer rather than its contents.

## [0.2.1] - 2026-08-11

A fourth adversarial round, and two of its findings were half-corrections from
the third.

### Fixed

- A query carrying no words was dropped, which left the faceted path to answer
  with the whole catalogue under a question nobody put. It is refused.
- A page beyond what a full-text search reads was named as covered while the
  catalogue answered its first page, so three pages returned the same rows each
  stamped as its own. The answer now says which catalogues could take no page and
  that their rows repeat a first page.
- A name no record carries produced rows indistinguishable from a real hit, since
  a row reaching the index on one word of a name is not a row carrying it. The
  answer says how many rows carry the name as asked, and says plainly when none
  does.
- The studios section returned every studio a record credits, with no total and
  no truncation, where the other two sections bound themselves and say so.

## [0.2.0] - 2026-08-11

Three rounds of fuzz and persona testing against the live catalogues. Every
finding is listed, because each one is a statement the server made that its data
did not carry.

### Fixed

- One catalogue answers a performer search with the first page of itself whatever
  is asked, and a scene search with no rows at all. Its unnarrowed page came back
  as an answer to a name. It is named as absent from both search tools.
- A match was built from every algorithm asked for rather than from those a
  catalogue was actually sent, so a scene found by its file hash was emitted a
  second time as a resemblance, by a catalogue that searches none.
- Reading a record failed outright on that catalogue: an edit there carries an
  identifier and no status, and the status was asked for.
- A list of identifiers was read as any one of them, silently, so a scene
  crediting one of two performers was indistinguishable from one crediting both.
  The reading is an argument now and travels with every answer.
- A fingerprint of the wrong length for its algorithm, of nothing but zeroes, or
  given twice.
- Three date comparisons the catalogue does not define, which failed every date
  narrowing; and two career-year arguments it accepts and applies to nothing.
- A page past what is served was brought back to the last one while the answer
  named the page that was asked for.
- A query of spaces reached the index and came back empty, describing the
  question and reading as the corpus.
- A count beside a page of rows echoed the page size on one catalogue and was
  published as what its index holds.
- Addresses are built from identifiers a catalogue could have minted, and escaped.
- A catalogue that failed now reaches the prose, since a failure and an emptiness
  read alike to anyone who does not open the payload.

### Added

- `retrieved_at` on every record, and `cached` on an answer served from the store.
- What a catalogue's index holds beyond the page returned, and a sentence saying a
  page is past the end rather than leaving an emptiness to be read as a corpus.
- A sentence saying a requested order holds inside a catalogue and not across
  them, and one saying a date recorded to the year is compared as a day.
- Notes are cut to those that qualify the answer carrying them.

## [0.1.1] - 2026-08-11

### Fixed

- The bundle's manifest named a path the packed bundle does not carry, so a
  desktop install found no server to start. It now names the layout the package
  actually has.
- The registry entry declared the npm package alone, so the bundle attached to a
  release was published and never advertised.
