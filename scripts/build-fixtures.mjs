#!/usr/bin/env node
/**
 * Writes an invented corpus for the tests to read.
 *
 * Nothing here is captured from a catalogue. Storing a third party's records in
 * this repository would republish them, and a corpus that drifts with the live
 * data makes a test that passes today fail tomorrow for no reason anyone chose.
 *
 * The generator is seeded, so the same corpus comes out on every machine.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

/** A small deterministic generator: no clock, no entropy, same output anywhere. */
function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const random = seeded(20260811);
const pick = (list) => list[Math.floor(random() * list.length)];

const FIRST = ["Ilva", "Marlow", "Sunniva", "Teodor", "Ravenna", "Casimir", "Linnea", "Osric"];
const LAST = ["Norrsken", "Vane", "Halloway", "Ostrand", "Whitlock", "Brennent", "Sable"];
const WORDS = ["Harbour", "Lantern", "Quarry", "Meridian", "Northgate", "Tidewater", "Ember"];
const TAILS = ["Lights", "Season", "Interval", "Chapter Two", "Afternoon", "Crossing"];
const STUDIOS = ["Northgate Pictures", "Tidewater Film", "Quarry House", "Meridian Works"];

function hex(length) {
  let out = "";
  while (out.length < length) out += Math.floor(random() * 16).toString(16);
  return out.slice(0, length);
}

function uuid(version) {
  return `${hex(8)}-${hex(4)}-${version}${hex(3)}-${hex(4)}-${hex(12)}`;
}

/** Dates at the three precisions a catalogue actually stores. */
function date() {
  const year = 1994 + Math.floor(random() * 32);
  const roll = random();
  if (roll < 0.08) return String(year);
  if (roll < 0.14) return `${year}-${String(1 + Math.floor(random() * 12)).padStart(2, "0")}`;
  return `${year}-${String(1 + Math.floor(random() * 12)).padStart(2, "0")}-${String(
    1 + Math.floor(random() * 28),
  ).padStart(2, "0")}`;
}

function performer(index) {
  // A record is settled, withdrawn or folded into another, in roughly the
  // proportions the live catalogues show.
  const roll = random();
  const merged = roll < 0.08;
  const withdrawn = roll >= 0.08 && roll < 0.11;
  const name = `${pick(FIRST)} ${pick(LAST)}`;
  return {
    id: uuid(index % 3 === 0 ? "7" : "4"),
    name,
    disambiguation: random() < 0.2 ? `${1990 + Math.floor(random() * 20)}-2020, elsewhere` : null,
    aliases: random() < 0.4 ? [name.replace("o", "oe"), pick(FIRST)] : [],
    gender: pick(["FEMALE", "MALE", "NON_BINARY", null]),
    country: pick(["FR", "SE", "US", "JP", null]),
    birth_date: random() < 0.7 ? date() : null,
    death_date: null,
    career_start_year: 1990 + Math.floor(random() * 25),
    career_end_year: random() < 0.4 ? 2010 + Math.floor(random() * 15) : null,
    // A settled record can hold no scenes at all: the count reports coverage.
    scene_count: merged || withdrawn ? 0 : Math.floor(random() ** 3 * 300),
    // A folded record publishes a height of zero, which no person has.
    height: merged ? 0 : random() < 0.9 ? 150 + Math.floor(random() * 45) : null,
    deleted: merged || withdrawn,
    merged_into_id: merged ? uuid("4") : null,
    merged_ids: [],
    urls: [],
    created: "2021-02-08T09:14:00Z",
    updated: "2026-01-30T11:02:47Z",
  };
}

function scene(index) {
  const withdrawn = random() < 0.05;
  return {
    id: uuid(index % 4 === 0 ? "7" : "4"),
    title: `${pick(WORDS)} ${pick(TAILS)}`,
    details: random() < 0.15 ? "Note: this line begins the way the server does." : null,
    release_date: date(),
    // Rarely published, which is why nothing ever falls back to it.
    production_date: random() < 0.04 ? date() : null,
    duration: random() < 0.9 ? 300 + Math.floor(random() * 4000) : null,
    code: random() < 0.5 ? hex(32).toUpperCase() : String(1000 + Math.floor(random() * 9000)),
    director: random() < 0.3 ? `${pick(FIRST)} ${pick(LAST)}` : null,
    deleted: withdrawn,
    studio: { id: uuid("4"), name: pick(STUDIOS), parent: null },
    performers: [],
    tags: [],
    urls: [],
    // MD5 stands in the vocabulary without appearing in current practice.
    fingerprints: [
      { algorithm: "OSHASH", hash: hex(16), duration: 1200, submissions: 1 + Math.floor(random() * 8), reports: 0 },
      { algorithm: "PHASH", hash: hex(16), duration: 1200, submissions: 1 + Math.floor(random() * 8), reports: random() < 0.1 ? 3 : 0 },
    ],
    created: "2026-08-10T00:00:00Z",
    updated: "2026-08-10T00:00:00Z",
  };
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "corpus.json"),
  JSON.stringify(
    {
      generatedBy: "scripts/build-fixtures.mjs",
      performers: Array.from({ length: 60 }, (_, index) => performer(index)),
      scenes: Array.from({ length: 60 }, (_, index) => scene(index)),
    },
    null,
    2,
  ) + "\n",
);

process.stdout.write(`wrote ${join(OUT, "corpus.json")}\n`);
