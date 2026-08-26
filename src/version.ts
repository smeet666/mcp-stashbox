/**
 * Who this client says it is.
 *
 * The version travels in the user agent, so a catalogue reading its logs can
 * tell which build asked and where to write about traffic it did not expect.
 * It is kept here alone: read from the package at runtime it would be absent
 * from the bundle, and written twice it would drift.
 */

export const PKG_NAME = "mcp-stashbox";
export const VERSION = "2.0.0";
export const REPO_URL = "https://github.com/smeet666/mcp-stashbox";

/** Where an answer this client could not read is reported. */
export const ISSUES_URL = `${REPO_URL}/issues`;

/** A person reachable about traffic a catalogue did not expect. */
export const CONTACT_URL = REPO_URL;
