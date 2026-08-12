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

import { supports, type InstanceSpec } from "./instances.js";

/**
 * The reimplementation publishes no table sorting the sites a record links to,
 * so asking it for a category fails the whole request.
 */
const SITE = (spec: InstanceSpec) =>
  supports(spec, "site_categories") ? "site { name category { name } }" : "site { name }";

const URLS = (spec: InstanceSpec) => `urls { url ${SITE(spec)} }`;

const IMAGES = "images { id url width height }";

const FINGERPRINTS = (spec: InstanceSpec) =>
  supports(spec, "fingerprint_reports")
    ? "fingerprints { algorithm hash duration submissions reports }"
    : // A catalogue counting no reports against a fingerprint answers a match
      // whose contest is unknown, and asking it for the field fails the request.
      "fingerprints { algorithm hash duration submissions }";

/**
 * Edits, asked for only where a status can be read off them.
 *
 * An edit carries a status on the published server and nothing but an
 * identifier on the reimplementation, so asking for one there fails the whole
 * request. A catalogue that cannot say whether an edit is open reports no count
 * instead.
 */
const EDITS = (spec: InstanceSpec) => (supports(spec, "pending_edits") ? "edits { status }" : "");

const SCENE_BASIC = (spec: InstanceSpec, edits: string) => `
  id
  title
  details
  release_date
  production_date
  duration
  code
  director
  deleted
  studio { id name deleted parent { id name deleted } }
  performers { as performer { id name disambiguation deleted merged_into_id } }
  tags { id name deleted category { id name } }
  ${URLS(spec)}
  ${edits}
  created
  updated
`;

const SCENE_ROW = (spec: InstanceSpec) => `
  id
  title
  release_date
  duration
  deleted
  studio { id name deleted parent { id name deleted } }
  performers { as performer { id name disambiguation deleted merged_into_id } }
  ${URLS(spec)}
  created
  updated
`;

const PERFORMER_BASIC = (spec: InstanceSpec, edits: string) => `
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
  ${URLS(spec)}
  ${edits}
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

export function findSceneDocument(spec: InstanceSpec, sections: SceneSections): string {
  return `query FindScene($id: ID!) {
  findScene(id: $id) {
    ${SCENE_BASIC(spec, EDITS(spec))}
    ${sections.fingerprints ? FINGERPRINTS(spec) : ""}
    ${sections.images ? IMAGES : ""}
  }
}`;
}

export function findPerformerDocument(spec: InstanceSpec, sections: PerformerSections): string {
  return `query FindPerformer($id: ID!) {
  findPerformer(id: $id) {
    ${PERFORMER_BASIC(spec, EDITS(spec))}
    ${sections.appearance ? PERFORMER_APPEARANCE : ""}
    ${sections.images ? IMAGES : ""}
    ${sections.studios ? "studios { studio { id name deleted } scene_count }" : ""}
  }
}`;
}

/** The faceted scene query, which every catalogue answers. */
export function queryScenesDocument(spec: InstanceSpec): string {
  return `query QueryScenes($input: SceneQueryInput!) {
  queryScenes(input: $input) {
    count
    scenes { ${SCENE_ROW(spec)} }
  }
}`;
}

export function queryPerformersDocument(spec: InstanceSpec): string {
  return `query QueryPerformers($input: PerformerQueryInput!) {
  queryPerformers(input: $input) {
    count
    performers { ${PERFORMER_BASIC(spec, EDITS(spec))} }
  }
}`;
}

/**
 * The full-text searches, which the published server offers in the plural and
 * the reimplementation does not offer at all.
 */
export function searchScenesDocument(spec: InstanceSpec): string {
  return `query SearchScenes($term: String!, $limit: Int) {
  searchScenes(term: $term, limit: $limit) {
    count
    scenes { ${SCENE_ROW(spec)} }
  }
}`;
}

export function searchPerformersDocument(spec: InstanceSpec): string {
  return `query SearchPerformers($term: String!, $limit: Int) {
  searchPerformers(term: $term, limit: $limit) {
    count
    performers { ${PERFORMER_BASIC(spec, EDITS(spec))} }
  }
}`;
}

export function findByFingerprintDocument(spec: InstanceSpec): string {
  return `query FindByFingerprint($fingerprints: [[FingerprintQueryInput!]!]!) {
  findScenesBySceneFingerprints(fingerprints: $fingerprints) {
    ${SCENE_ROW(spec)}
    ${FINGERPRINTS(spec)}
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
