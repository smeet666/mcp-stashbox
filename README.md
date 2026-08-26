# mcp-stashbox

[![npm](https://img.shields.io/npm/v/mcp-stashbox.svg)](https://www.npmjs.com/package/mcp-stashbox)
[![CI](https://github.com/smeet666/mcp-stashbox/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-stashbox/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-stashbox.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-stashbox)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-stashbox-0cvg7f?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-stashbox-0cvg7f)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=stashbox&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1zdGFzaGJveCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=stashbox&config=%7B%22name%22%3A%22stashbox%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-stashbox%22%5D%7D)

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

### With Docker

```json
{
  "mcpServers": {
    "stashbox": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "STASHBOX_STASHDB_KEY",
        "ghcr.io/smeet666/mcp-stashbox:2.0.0"
      ],
      "env": {
        "STASHBOX_STASHDB_KEY": "your-key"
      }
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and no `-t` is
passed: a TTY rewrites the stream and breaks it. The container needs outbound
HTTPS to `stashdb.org`, `theporndb.net`, `fansdb.cc`, `pmvstash.org` and `javstash.org`, and nothing else: no volume, no port, and the keys travel through the environment rather than inside the image.

Optional settings: `SB_USER_AGENT`, `SB_MIN_INTERVAL_MS` (default and floor
1000, ceiling 60000), `SB_TIMEOUT_MS` (20000), `SB_MAX_RETRIES` (3), `SB_CACHE_TTL_MS` (300000),
`SB_CACHE_MAX_ENTRIES` (500), `SB_LOG_LEVEL` (`error`).

## Tools

| Tool                  | What it answers                                                     |
| --------------------- | ------------------------------------------------------------------- |
| `get_sources`         | what each catalogue was measured answering, and the day it was read |
| `search_scenes`       | scenes across every catalogue that answers a search                 |
| `search_performers`   | performers, on names and aliases alike                              |
| `search_studios`      | studios, and the studios under one parent                           |
| `search_tags`         | tags, and the tags of one category                                  |
| `get_scene`           | one scene, with opt-in `fingerprints` and `images`                  |
| `get_performer`       | one performer, with opt-in `appearance`, `images`, `studios`        |
| `get_studio`          | one studio, with the parent it names                                |
| `get_tag`             | one tag, with the category it sits in                               |
| `find_by_fingerprint` | what a file is, from the hashes held for it                         |

A search answers with identifiers. A record route reads one record on every
catalogue that holds it, following the link each of them publishes to the same
record elsewhere, and every value on the answer names the catalogues that said
it. Name `sources` to read one catalogue alone.

Sections are opt-in because a scene's fingerprints weigh more than everything
else it carries. The scenes crediting a performer are read by `search_scenes`
with `performer_ids`, which pages and filters, so no record route carries a
block that runs a search of its own.

`search_tags` is the way in to `tag_ids`, and `search_studios` to `studio_ids`:
find the identifier, then narrow a scene search with it.

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
interface from a source of its own, and what it answers was read from it rather
than assumed: `get_sources` publishes that table with the day it was measured.

It answers a search of words on scenes and on performers, under route names of
its own. Its faceted routes do not apply the narrowings written to them, so a
question narrowed on typed arguments is never put to it and the answer says so.
It answers no search of studios and none of tags, and reads one of either by
identifier or by name. It publishes no table sorting the sites a record links
to, no taxonomy sorting its tags, no count of the scenes it indexes for a
performer, no count of edits open against a record, and it counts no disputes
over a fingerprint.

Each of those is reported on every answer holding its rows, and no value is
filled in from a neighbour.

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
1000, plafond 60000), `SB_TIMEOUT_MS` (20000), `SB_MAX_RETRIES` (3), `SB_CACHE_TTL_MS` (300000),
`SB_CACHE_MAX_ENTRIES` (500), `SB_LOG_LEVEL` (`error`).

## Les outils

`get_sources`, quatre recherches (`search_scenes`, `search_performers`,
`search_studios`, `search_tags`), quatre lectures (`get_scene`, `get_performer`,
`get_studio`, `get_tag`) et `find_by_fingerprint`.

Une recherche répond par des identifiants. Une lecture lit la fiche sur chaque
catalogue qui la détient, en suivant le lien que chacun publie vers la même
fiche ailleurs, et chaque valeur nomme les catalogues qui l'ont dite. Nommez
`sources` pour ne lire qu'un catalogue.

Les sections sont facultatives parce que les empreintes d'une scène pèsent plus
que tout ce qu'elle porte. Les scènes créditant une personne se lisent par
`search_scenes` avec `performer_ids`, qui pagine et filtre.

## Ce que chaque catalogue répond

`get_sources` publie ce que chaque catalogue a été **mesuré** répondre, la route
sur laquelle chaque capacité a été vue, et le jour où sa surface a été lue chez
lui. Rien n'y est déduit du logiciel qu'un catalogue est supposé faire tourner :
quatre d'entre eux ont répondu les mêmes noms de routes parce que chacun a été
interrogé, et l'un des quatre ne déclare aucun champ pour rétrécir une scène sur
la référence du studio, ce que ses fiches portent pourtant.

Détenir une clé pour un catalogue est un fait sur votre installation et ne
change rien à ce que ce catalogue sait faire. Les deux restent deux champs.

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
