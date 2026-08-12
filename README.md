# mcp-stashbox

An MCP server for the public **stash-box** metadata catalogues. Search scenes and
performers, read one record, and identify a file from the fingerprints held for
it.

These catalogues describe scenes, performers, studios and tags. **They hold no
media**: a record names where something was published and carries nothing of it.

## What it reads

| Catalogue | Address         | Notes                                                     |
| --------- | --------------- | --------------------------------------------------------- |
| StashDB   | `stashdb.org`   | the canonical catalogue, curated by submission and review |
| ThePornDB | `theporndb.net` | answers a smaller surface (see below)                     |
| FansDB    | `fansdb.cc`     | independent creators                                      |
| PMV Stash | `pmvstash.org`  | fan edits and music videos                                |
| JAVStash  | `javstash.org`  |                                                           |

Every catalogue issues its own key to a registered account. **A catalogue with no
key is named as absent from every answer**, so an
answer holding rows from some of them is never read as the whole.

## Setup

Each catalogue is configured through its own variable. One is enough to start.

| Variable                | Catalogue |
| ----------------------- | --------- |
| `STASHBOX_STASHDB_KEY`  | StashDB   |
| `STASHBOX_TPDB_KEY`     | ThePornDB |
| `STASHBOX_FANSDB_KEY`   | FansDB    |
| `STASHBOX_PMV_KEY`      | PMV Stash |
| `STASHBOX_JAVSTASH_KEY` | JAVStash  |

A key is found on your profile page once you are registered and logged in.

```json
{
  "mcpServers": {
    "stashbox": {
      "command": "npx",
      "args": ["-y", "mcp-stashbox"],
      "env": { "STASHBOX_STASHDB_KEY": "your-key" }
    }
  }
}
```

Optional settings: `SB_USER_AGENT`, `SB_MIN_INTERVAL_MS` (default and floor
1000), `SB_TIMEOUT_MS` (20000), `SB_MAX_RETRIES` (3), `SB_CACHE_TTL_MS` (300000),
`SB_CACHE_MAX_ENTRIES` (500), `SB_LOG_LEVEL` (`error`).

## Tools

| Tool                  | What it answers                                                        |
| --------------------- | ---------------------------------------------------------------------- |
| `search_scenes`       | scenes across every configured catalogue                               |
| `search_performers`   | performers, matched on names and aliases alike                         |
| `get_scene`           | one scene, with opt-in `fingerprints` and `images`                     |
| `get_performer`       | one performer, with opt-in `appearance`, `images`, `scenes`, `studios` |
| `find_by_fingerprint` | what a file is, from the hashes held for it                            |

Sections are opt-in because two of them dwarf the rest: a scene's fingerprints
weigh more than everything else it carries, and a performer's scenes run to
thousands.

## What an answer is allowed to claim

Each of these exists because breaking it produces a confident false statement.

**Three fingerprint algorithms make three different claims.** MD5 and OSHASH
match the same file, byte for byte. PHASH matches images that _resemble_ each
other, which covers a re-encode, a crop, and a different scene from the same
shoot. Every match carries its algorithm and says which kind of claim it is.

**A fingerprint report that was never counted leaves the contest unknown.**
One catalogue publishes how many people submitted a fingerprint and never how
many disputed it. A match from it reports `contested: null`, since rendering that
as `false` would state an agreement nobody expressed.

**A scene count counts one catalogue's coverage.** A settled performer record
naming a career spanning decades can report zero scenes. That measures what the
catalogue has indexed and states nothing about a person's work.

**A folded identifier answers.** When two records are joined, the older
identifier still resolves and comes back as a marker naming its successor. It is
a record under a new name, and its emptied fields describe
the record, never the world.

**A date keeps the precision it was entered with.** The catalogues store dates as
text, so a record carries a full day, a month or a bare year. A bare year is
never printed as a day. A date shaped like a date that names none (a thirteenth
month, the thirty-first of April) is read as no date at all.

**A refusal is never an absence.** These catalogues answer HTTP 200 with an error
and a null payload, so a client reading the payload alone renders "there is no
such record" where the catalogue said "I do not authorise you to ask". Errors are
read first, every time.

**Counts are never added and rows are never ranked across catalogues.** They
index overlapping corpora and publish no score in common, so rows interleave and
every answer says how the order was built.

**Nothing states what may be reused.** These catalogues publish no terms on a
record, so no answer carries any, and that silence is never read as permission.

## The catalogue that answers a smaller surface

Four of these run one published open-source server. ThePornDB reimplements its
interface from a source of its own. It reads records in full, and it answers no
search at all, neither by words nor by typed arguments, so one of its records is
reached by a fingerprint or by an identifier already held. It publishes no table
sorting the sites a record links to, no taxonomy sorting its tags, no count of
the scenes it indexes for a performer, no count of edits open against a record,
and it counts no disputes over a fingerprint. Each of those is reported on every answer
holding its rows. No value is filled in from a neighbour.

## As a library

The lower layer is published on its own, with the pacing, the store and the error
taxonomy and no protocol attached.

```ts
import { StashboxClient } from "mcp-stashbox/client";

const client = new StashboxClient({ keys: { stashdb: process.env.STASHBOX_STASHDB_KEY } });
const read = await client.findByFingerprint({
  fingerprints: [{ hash: "…", algorithm: "PHASH" }],
});
```

The floor on pacing holds through this entry point too: a consumer cannot ask
these catalogues for more than the server would.

## What this owes the catalogues

They are run by their communities and paid for by donations, and none of them
publishes a rate limit. One request at a time per catalogue, spaced by at least a
second, widening when a catalogue pushes back. The `User-Agent` always carries
this project's identifier and an address where a person can be reached.

## Licence

MIT. See `LICENSE`.

---

# mcp-stashbox (français)

Un serveur MCP pour les catalogues de métadonnées **stash-box** publics. Chercher
des scènes et des personnes, lire une fiche, et identifier un fichier à partir
des empreintes qu'on en détient.

Ces catalogues décrivent des scènes, des personnes, des studios et des tags.
**Ils ne détiennent aucun média** : une fiche nomme le lieu de publication et
n'en porte rien.

## Ce qu'il lit

StashDB (`stashdb.org`), ThePornDB (`theporndb.net`), FansDB (`fansdb.cc`),
PMV Stash (`pmvstash.org`) et JAVStash (`javstash.org`). Chaque catalogue délivre
sa propre clé à un compte inscrit. **Un catalogue sans clé est nommé comme absent
de chaque réponse**, jamais retiré en silence.

## Configuration

`STASHBOX_STASHDB_KEY`, `STASHBOX_TPDB_KEY`, `STASHBOX_FANSDB_KEY`,
`STASHBOX_PMV_KEY`, `STASHBOX_JAVSTASH_KEY`. Une seule suffit pour commencer. La
clé se lit sur la page de profil une fois connecté.

Réglages facultatifs : `SB_USER_AGENT`, `SB_MIN_INTERVAL_MS` (défaut et plancher
1000), `SB_TIMEOUT_MS` (20000), `SB_MAX_RETRIES` (3), `SB_CACHE_TTL_MS` (300000),
`SB_CACHE_MAX_ENTRIES` (500), `SB_LOG_LEVEL` (`error`).

## Les outils

`search_scenes`, `search_performers`, `get_scene`, `get_performer` et
`find_by_fingerprint`. Les sections sont facultatives parce que deux d'entre
elles écrasent les autres : les empreintes d'une scène pèsent plus que tout ce
qu'elle porte, et les scènes d'une personne se comptent par milliers.

## Ce qu'une réponse a le droit d'affirmer

**Trois algorithmes d'empreinte, trois affirmations différentes.** MD5 et OSHASH
désignent le même fichier, octet pour octet. PHASH désigne des images qui _se
ressemblent_, ce qui couvre un ré-encodage, un recadrage et une autre scène du
même tournage.

**Une contestation jamais comptée laisse la contestation inconnue.** Un
catalogue publie le nombre de soumissions d'une empreinte sans jamais publier le
nombre de contestations. Une correspondance venue de lui rend `contested: null`.

**Un compteur de scènes mesure la couverture d'un catalogue.** Une fiche établie
annonçant une carrière de plusieurs décennies peut en porter zéro.

**Un identifiant fusionné répond.** Il revient sous forme de marqueur nommant son
successeur : une fiche sous un autre nom plutôt qu'une absence.

**Une date garde la précision avec laquelle elle a été saisie.** Une année seule
n'est jamais rendue comme un jour, et une date qui n'en nomme aucun, un
treizième mois ou le 31 avril, n'est pas une date.

**Un refus n'est jamais une absence.** Ces catalogues répondent 200 avec une
erreur et une charge nulle, donc les erreurs sont lues avant la charge.

**Les compteurs ne s'additionnent pas et les lignes ne se classent pas entre
catalogues.** Elles s'entrelacent, et chaque réponse dit comment l'ordre a été
construit.

## Ce qu'on doit à ces catalogues

Ils sont communautaires et financés par dons, et aucun ne publie de limite. Une
requête à la fois par catalogue, espacée d'au moins une seconde, élargie quand un
catalogue le demande. Le `User-Agent` porte toujours l'identifiant du projet et
une adresse où joindre une personne.

## Licence

MIT. Voir `LICENSE`.
