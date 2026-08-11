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

## [0.1.1] - 2026-08-11

### Fixed

- The bundle's manifest named a path the packed bundle does not carry, so a
  desktop install found no server to start. It now names the layout the package
  actually has.
- The registry entry declared the npm package alone, so the bundle attached to a
  release was published and never advertised.
