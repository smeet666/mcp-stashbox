/**
 * Why a thing named in an answer carries no category.
 *
 * Two silences look alike and answer differently. A catalogue that publishes no
 * table sorting these things never placed one in a category, and a catalogue
 * that publishes the table and recorded nothing for this one left it out of a
 * table it keeps. A row shows neither, and a reader handed an uncategorised tag
 * cannot tell which of the two it is.
 *
 * The sentences live here because both answers owe them: a record read on its
 * own and a page of rows say the same thing about the same silence, and a
 * wording that drifted between them would read as two different findings.
 */

import type { Capability } from "../stashbox/instances.js";

/** A list whose entries a catalogue may place in a category. */
export interface Categorised {
  /** The capability naming the table, which is what the registry is asked for. */
  capability: Capability;
  /** The table, named as the catalogue's own limit names it. */
  table: string;
  /** One entry of the list, as a sentence names it. */
  each: string;
}

export const TAGS: Categorised = {
  capability: "tag_categories",
  table: "taxonomy sorting the tags a record carries",
  each: "tag",
};

export const LINKS: Categorised = {
  capability: "site_categories",
  table: "table sorting the sites a record links to",
  each: "link",
};

/** What a catalogue keeping no such table has said about every entry of the list. */
export function noTable(who: string, list: Categorised): string {
  return `${who} publishes no ${list.table}, so no ${list.each} from it here carries a category, and none of them is one it left uncategorised.`;
}

/** What a catalogue keeping the table has said by recording nothing for one entry. */
export function nothingRecorded(who: string, list: Categorised): string {
  return `${who} publishes a ${list.table}, and a ${list.each} from it here carries none, which is a category nobody recorded for it.`;
}
