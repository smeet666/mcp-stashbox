# mcp-stashbox

## Tagline

Search the public stash-box metadata catalogues, and identify a file by its fingerprint.

## Description

Reads the public stash-box catalogues (StashDB, ThePornDB, FansDB, PMV Stash and
JAVStash) for scenes, performers, studios and tags. These catalogues hold
metadata and no media: a record names where something was published and carries
nothing of it.

The server asks every catalogue you have configured and keeps the seams visible.
A catalogue that failed, one that was never asked and one that looked and found
nothing are three different things, and every answer says which is which. Counts
are never added across catalogues and rows are never ranked against each other,
because they publish no score in common.

## Setup Requirements

- `STASHBOX_STASHDB_KEY` (optional): API key for StashDB, from your profile page after registering. https://stashdb.org/register
- `STASHBOX_TPDB_KEY` (optional): API key for ThePornDB. https://theporndb.net/register
- `STASHBOX_FANSDB_KEY` (optional): API key for FansDB. https://fansdb.cc
- `STASHBOX_PMV_KEY` (optional): API key for PMV Stash. https://pmvstash.org
- `STASHBOX_JAVSTASH_KEY` (optional): API key for JAVStash. https://javstash.org

At least one key is required. A catalogue with no key is named as absent from
every answer.

## Category

Search & Web

## Features

- Search scenes across several catalogues at once
- Search performers, matched on stage names and variant spellings alike
- Read one scene, with fingerprints and images as opt-in sections
- Read one performer, with appearance, images, scenes and studios as opt-in sections
- Identify a file from every fingerprint held for it, in one request
- Distinguishes an exact file match from a perceptual resemblance
- Reports which catalogue answered, which failed, and which was never asked
- Resolves an identifier folded into another to the record that continues it
- Publishes the lower layer as a plain library with no protocol attached

## Getting Started

- "Which catalogues hold a scene with this PHASH?"
- "Find performers credited as Marlowe and show what each catalogue knows"
- Tool: find_by_fingerprint: Identify a file from its hashes, saying whether a match is the same file or an image that resembles it

## Tags

mcp, stash-box, stashdb, metadata, catalogue, fingerprint, phash, aggregator

## Documentation URL

https://github.com/smeet666/mcp-stashbox#readme
