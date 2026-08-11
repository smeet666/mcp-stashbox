/**
 * The documents sent to a catalogue, and where they have to differ.
 *
 * Four catalogues run one published server and a fifth reimplements it, so one
 * document does not parse against both. Two divergences are structural and both
 * were measured:
 *
 * - A site on the reimplementation carries a name and no category, so the table
 *   that sorts a record's links exists on one side only. Asking for a category
 *   there makes the whole request fail rather than returning a link without one.
 * - A scene query on the reimplementation requires a page, a sort and a
 *   direction that the published server leaves optional. Supplying all three
 *   always satisfies both.
 *
 * A fingerprint algorithm is an enumeration on one side and free text on the
 * other. It travels as a variable, since a variable carries an enumeration as a
 * string and each catalogue reads it in its own type.
 */

import type { Dialect } from "./instances.js";

/**
 * The reimplementation publishes no table sorting the sites a record links to,
 * so asking it for a category fails the whole request.
 */
const SITE = (dialect: Dialect) =>
  dialect === "strict" ? "site { name category { name } }" : "site { name }";

const URLS = (dialect: Dialect) => `urls { url ${SITE(dialect)} }`;

const IMAGES = "images { id url width height }";

const FINGERPRINTS = (dialect: Dialect) =>
  dialect === "strict"
    ? "fingerprints { algorithm hash duration submissions reports }"
    : // The reimplementation counts submissions and no reports, so a match from
      // it carries an unknown contest.
      "fingerprints { algorithm hash duration submissions }";

const SCENE_BASIC = (dialect: Dialect) => `
  id
  title
  details
  release_date
  production_date
  duration
  code
  director
  deleted
  studio { id name parent { id name } }
  performers { as performer { id name disambiguation } }
  tags { id name category { id name } }
  ${URLS(dialect)}
  edits { status }
  created
  updated
`;

const SCENE_ROW = (dialect: Dialect) => `
  id
  title
  release_date
  duration
  deleted
  studio { id name parent { id name } }
  performers { as performer { id name disambiguation } }
  ${URLS(dialect)}
`;

const PERFORMER_BASIC = (dialect: Dialect) => `
  id
  name
  disambiguation
  aliases
  gender
  country
  birth_date
  death_date
  career_start_year
  career_end_year
  scene_count
  deleted
  merged_ids
  merged_into_id
  ${URLS(dialect)}
  edits { status }
  created
  updated
`;

const PERFORMER_APPEARANCE = `
  ethnicity
  eye_color
  hair_color
  height
  cup_size
  band_size
  waist_size
  hip_size
  breast_type
  tattoos { location description }
  piercings { location description }
`;

export interface SceneSections {
  fingerprints: boolean;
  images: boolean;
}

export interface PerformerSections {
  appearance: boolean;
  images: boolean;
  scenes: boolean;
  studios: boolean;
}

export function findSceneDocument(dialect: Dialect, sections: SceneSections): string {
  return `query FindScene($id: ID!) {
  findScene(id: $id) {
    ${SCENE_BASIC(dialect)}
    ${sections.fingerprints ? FINGERPRINTS(dialect) : ""}
    ${sections.images ? IMAGES : ""}
  }
}`;
}

export function findPerformerDocument(dialect: Dialect, sections: PerformerSections): string {
  return `query FindPerformer($id: ID!) {
  findPerformer(id: $id) {
    ${PERFORMER_BASIC(dialect)}
    ${sections.appearance ? PERFORMER_APPEARANCE : ""}
    ${sections.images ? IMAGES : ""}
    ${sections.studios ? "studios { studio { id name } scene_count }" : ""}
  }
}`;
}

/** The faceted scene query, which every catalogue answers. */
export function queryScenesDocument(dialect: Dialect): string {
  return `query QueryScenes($input: SceneQueryInput!) {
  queryScenes(input: $input) {
    count
    scenes { ${SCENE_ROW(dialect)} }
  }
}`;
}

export function queryPerformersDocument(dialect: Dialect): string {
  return `query QueryPerformers($input: PerformerQueryInput!) {
  queryPerformers(input: $input) {
    count
    performers { ${PERFORMER_BASIC(dialect)} }
  }
}`;
}

/**
 * The full-text searches, which the published server offers in the plural and
 * the reimplementation does not offer at all.
 */
export function searchScenesDocument(dialect: Dialect): string {
  return `query SearchScenes($term: String!, $limit: Int) {
  searchScenes(term: $term, limit: $limit) {
    count
    scenes { ${SCENE_ROW(dialect)} }
  }
}`;
}

export function searchPerformersDocument(dialect: Dialect): string {
  return `query SearchPerformers($term: String!, $limit: Int) {
  searchPerformers(term: $term, limit: $limit) {
    count
    performers { ${PERFORMER_BASIC(dialect)} }
  }
}`;
}

export function findByFingerprintDocument(dialect: Dialect): string {
  return `query FindByFingerprint($fingerprints: [[FingerprintQueryInput!]!]!) {
  findScenesBySceneFingerprints(fingerprints: $fingerprints) {
    ${SCENE_ROW(dialect)}
    ${FINGERPRINTS(dialect)}
  }
}`;
}

/**
 * Paging arguments a scene query carries.
 *
 * All three travel whatever the catalogue is, since the stricter of the two
 * requires them and the other accepts them.
 */
export function sceneQueryPaging(page: number, perPage: number, sort: string, direction: string) {
  return { page, per_page: perPage, sort, direction };
}
