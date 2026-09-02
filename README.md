# mcp-stashbox

[![npm](https://img.shields.io/npm/v/mcp-stashbox.svg)](https://www.npmjs.com/package/mcp-stashbox)
[![CI](https://github.com/smeet666/mcp-stashbox/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-stashbox/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-stashbox.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-stashbox)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-stashbox-0cvg7f?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-stashbox-0cvg7f)
[![LobeHub](https://lobehub.com/badge/mcp/smeet666-mcp-stashbox)](https://lobehub.com/mcp/smeet666-mcp-stashbox)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=stashbox&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1zdGFzaGJveCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=stashbox&config=%7B%22name%22%3A%22stashbox%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-stashbox%22%5D%7D)

A stash-box is a shared metadata catalogue: it records scenes, the performers
credited on them, the studios that released them, and the tags they are filed
under, each curated by submission and review. **A catalogue holds no media** — a
record names where something was published and carries nothing of it — and it
identifies a file by the fingerprints computed from it. Five such catalogues run
independently, each issuing its own key to a registered account.

This server connects a chat client to all of them at once. You can search the
scenes, performers, studios and tags of every catalogue you hold a key for, read
one record as a single card assembled from every catalogue that holds it,
identify a file from its fingerprints, and ask what each catalogue was measured
answering. **It needs a key per catalogue**, and reads only the catalogues it has
one for.

_[Version française](#mcp-stashbox-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=stashbox&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1zdGFzaGJveCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=stashbox&config=%7B%22name%22%3A%22stashbox%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-stashbox%22%5D%7D)

**Claude Code**

```bash
claude mcp add stashbox --env STASHBOX_STASHDB_KEY=your-key -- npx -y mcp-stashbox
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "stashbox": {
      "command": "npx",
      "args": ["-y", "mcp-stashbox"],
      "env": {
        "STASHBOX_STASHDB_KEY": "your-key"
      }
    }
  }
}
```

Node 24 or later is required. Set a key for each catalogue you want read; the
others are named as absent from every answer.

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
        "ghcr.io/smeet666/mcp-stashbox:2.0.1"
      ]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to the
catalogues you hold keys for, and the keys from your environment: no volume, no
port.

### Bundle, without npm

Download `mcp-stashbox-2.0.1.mcpb` from
[the latest release](https://github.com/smeet666/mcp-stashbox/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm to run. The keys are still set in the client's configuration.

## What you can ask

- "Which catalogues am I actually reading?"
- "Find the performers credited under that name."
- "Read me that studio's record."
- "What is this file? Here is its MD5."
- "Which scenes did those two perform in together?"

The ordinary path runs from a search to a card: a row carries an `id` written
`instance:uuid`, and the record tool reads it on every catalogue that holds it.

## The catalogues

| Catalogue | Address         | Key                     |
| --------- | --------------- | ----------------------- |
| StashDB   | `stashdb.org`   | `STASHBOX_STASHDB_KEY`  |
| TPDB      | `theporndb.net` | `STASHBOX_TPDB_KEY`     |
| FansDB    | `fansdb.cc`     | `STASHBOX_FANSDB_KEY`   |
| PMV Stash | `pmvstash.org`  | `STASHBOX_PMV_KEY`      |
| JAVStash  | `javstash.org`  | `STASHBOX_JAVSTASH_KEY` |

They answer different surfaces: StashDB answers every route this server knows,
and the others answer fewer. `get_sources` states what each was measured
answering and the day it was measured. **A catalogue with no key is named as
absent from every answer**, so an answer holding rows from some of them is never
read as the whole.

## Tools

| Tool                  | What it does                                                 |
| --------------------- | ------------------------------------------------------------ |
| `get_sources`         | States what each catalogue answers, and which keys are held. |
| `search_scenes`       | Searches the scenes of every configured catalogue.           |
| `search_performers`   | Searches the performers.                                     |
| `search_studios`      | Searches the studios.                                        |
| `search_tags`         | Searches the tags.                                           |
| `get_scene`           | Reads one scene as a single card.                            |
| `get_performer`       | Reads one performer as a single card.                        |
| `get_studio`          | Reads one studio as a single card.                           |
| `get_tag`             | Reads one tag as a single card.                              |
| `find_by_fingerprint` | Identifies a file from the hashes held for it.               |

**Every search takes two exclusive paths.** `query` runs each catalogue's own
text index, which reads the words as a union. The typed arguments narrow as an
intersection. Writing both is refused.

### `get_sources`

States what each configured catalogue was measured answering, and the day its
surface was read. It reaches no catalogue and takes no argument.

**In return:** one entry per catalogue with its name, its identifier prefix,
whether a key is held for it in this install, the variable to set when none is,
and the routes it answers. Whether a key is held is a fact about this install and
changes nothing about what the catalogue does.

### `search_scenes`

Searches the scenes.

| Argument           | Type                                                                                | Required | What it does                                |
| ------------------ | ----------------------------------------------------------------------------------- | -------- | ------------------------------------------- |
| `query`            | string                                                                              | no       | Words for each catalogue's own text index.  |
| `title`            | string                                                                              | no       | Words a title carries.                      |
| `code`             | string                                                                              | no       | The studio's own reference for the release. |
| `alias`            | string                                                                              | no       | Another title the release is known by.      |
| `date`             | a calendar day                                                                      | no       | The release date to compare against.        |
| `date_compare`     | `on`, `before` or `after`                                                           | no       | How that date is read.                      |
| `performer_ids`    | list of identifiers                                                                 | no       | Performers credited on it.                  |
| `studio_ids`       | list of identifiers                                                                 | no       | Studios that released it.                   |
| `parent_studio_id` | an identifier                                                                       | no       | A studio the releasing studio sits under.   |
| `tag_ids`          | list of identifiers                                                                 | no       | Tags it is filed under.                     |
| `match`            | `all` or `any`                                                                      | no       | How a list of identifiers is read.          |
| `sort`             | `title`, `date`, `duration`, `trending`, `popularity`, `created_at` or `updated_at` | no       | The order the catalogue applies.            |
| `direction`        | `asc` or `desc`                                                                     | no       | Which way that order runs.                  |
| `page`             | integer, 1 to 1000                                                                  | no       | Which page of each catalogue's own order.   |
| `limit`            | integer, 1 to 100                                                                   | no       | Rows one page of one catalogue carries.     |
| `sources`          | list of catalogues                                                                  | no       | Read these catalogues alone.                |

**In return:** rows carrying the `id` written `instance:uuid`, which `get_scene`
takes, and what names the record. A row leaves the synopsis, the link lists and
the editing stamps to the card, since none of those separates two releases.
**The answer says per catalogue which of three it met:** a failure, a catalogue
nobody asked, or an emptiness it established. **Counts are never added across
catalogues.** A search written with words alone reads the first rows each text
index answers with, since those routes take no page.

### `search_performers`

Searches the performers.

| Argument            | Type                                                                                                                                    | Required | What it does                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------ |
| `query`             | string                                                                                                                                  | no       | Words for each catalogue's own text index. |
| `name`              | string                                                                                                                                  | no       | Words a name carries.                      |
| `alias`             | string                                                                                                                                  | no       | Another name they are known by.            |
| `disambiguation`    | string                                                                                                                                  | no       | What the catalogue adds to tell two apart. |
| `gender`            | one of the values the catalogue records                                                                                                 | no       | The gender the catalogue records.          |
| `country`           | a two-letter country code                                                                                                               | no       | The country the catalogue records.         |
| `ethnicity`         | one of the values the catalogue records                                                                                                 | no       | The ethnicity the catalogue records.       |
| `birth_year`        | integer, 1800 to 2200                                                                                                                   | no       | The year of birth.                         |
| `career_start_year` | integer, 1800 to 2200                                                                                                                   | no       | The year a career opened.                  |
| `career_end_year`   | integer, 1800 to 2200                                                                                                                   | no       | The year a career closed.                  |
| `performed_with`    | an identifier                                                                                                                           | no       | Someone they are credited alongside.       |
| `studio_id`         | an identifier                                                                                                                           | no       | A studio they are credited on.             |
| `sort`              | `name`, `birthdate`, `deathdate`, `scene_count`, `career_start_year`, `debut`, `last_scene`, `popularity`, `created_at` or `updated_at` | no       | The order the catalogue applies.           |
| `direction`         | `asc` or `desc`                                                                                                                         | no       | Which way that order runs.                 |
| `page`              | integer, 1 to 1000                                                                                                                      | no       | Which page.                                |
| `limit`             | integer, 1 to 100                                                                                                                       | no       | Rows one page of one catalogue carries.    |
| `sources`           | list of catalogues                                                                                                                      | no       | Read these catalogues alone.               |

**`alias` is declared and never sent.** No catalogue's faceted route applies it:
a request carrying it answers as wide as one carrying none, so it is left out and
the answer names it as a narrowing nobody received.

**In return:** the rows and the per-catalogue accounting `search_scenes`
returns.

### `search_studios`

Searches the studios.

| Argument     | Type                                 | Required | What it does                               |
| ------------ | ------------------------------------ | -------- | ------------------------------------------ |
| `query`      | string                               | no       | Words for each catalogue's own text index. |
| `name`       | string                               | no       | Words a name carries.                      |
| `parent_id`  | an identifier                        | no       | A studio it sits under.                    |
| `has_parent` | boolean                              | no       | Whether it sits under another at all.      |
| `sort`       | `name`, `created_at` or `updated_at` | no       | The order the catalogue applies.           |
| `direction`  | `asc` or `desc`                      | no       | Which way that order runs.                 |
| `page`       | integer, 1 to 1000                   | no       | Which page.                                |
| `limit`      | integer, 1 to 100                    | no       | Rows one page of one catalogue carries.    |
| `sources`    | list of catalogues                   | no       | Read these catalogues alone.               |

**In return:** the rows and the per-catalogue accounting `search_scenes` returns.

### `search_tags`

Searches the tags.

| Argument      | Type                                 | Required | What it does                               |
| ------------- | ------------------------------------ | -------- | ------------------------------------------ |
| `query`       | string                               | no       | Words for each catalogue's own text index. |
| `name`        | string                               | no       | Words a name carries.                      |
| `category_id` | an identifier                        | no       | A category the tag belongs to.             |
| `sort`        | `name`, `created_at` or `updated_at` | no       | The order the catalogue applies.           |
| `direction`   | `asc` or `desc`                      | no       | Which way that order runs.                 |
| `page`        | integer, 1 to 1000                   | no       | Which page.                                |
| `limit`       | integer, 1 to 100                    | no       | Rows one page of one catalogue carries.    |
| `sources`     | list of catalogues                   | no       | Read these catalogues alone.               |

**In return:** the rows and the per-catalogue accounting `search_scenes` returns.

### `get_scene`

Reads one scene as a single card.

| Argument   | Type                                     | Required | What it does                             |
| ---------- | ---------------------------------------- | -------- | ---------------------------------------- |
| `id`       | an identifier written `instance:uuid`    | yes      | The record to read.                      |
| `sections` | any of `basic`, `fingerprints`, `images` | no       | The blocks read beside the card.         |
| `sources`  | list of catalogues                       | no       | Read these catalogues alone.             |
| `prefer`   | list of catalogues                       | no       | The order preferred where they disagree. |

**In return:** one card, read on every catalogue that holds the record and
reached by the link each of them publishes to the same record elsewhere. **Every
value names the catalogues that said it**, and where they disagree the reading
nobody preferred is published beside the one that won. Left out, the registry's
own order stands, and every card states the order applied.

### `get_performer`

Reads one performer as a single card.

| Argument   | Type                                              | Required | What it does                             |
| ---------- | ------------------------------------------------- | -------- | ---------------------------------------- |
| `id`       | an identifier written `instance:uuid`             | yes      | The record to read.                      |
| `sections` | any of `basic`, `appearance`, `images`, `studios` | no       | The blocks read beside the card.         |
| `sources`  | list of catalogues                                | no       | Read these catalogues alone.             |
| `prefer`   | list of catalogues                                | no       | The order preferred where they disagree. |

`studios` is the whole table of studios they are credited on, which runs to
hundreds of rows.

**In return:** the card `get_scene` returns, for a performer.

### `get_studio`

Reads one studio as a single card.

| Argument  | Type                                  | Required | What it does                             |
| --------- | ------------------------------------- | -------- | ---------------------------------------- |
| `id`      | an identifier written `instance:uuid` | yes      | The record to read.                      |
| `sources` | list of catalogues                    | no       | Read these catalogues alone.             |
| `prefer`  | list of catalogues                    | no       | The order preferred where they disagree. |

**In return:** the card `get_scene` returns, for a studio.

### `get_tag`

Reads one tag as a single card.

| Argument  | Type                                  | Required | What it does                             |
| --------- | ------------------------------------- | -------- | ---------------------------------------- |
| `id`      | an identifier written `instance:uuid` | yes      | The record to read.                      |
| `sources` | list of catalogues                    | no       | Read these catalogues alone.             |
| `prefer`  | list of catalogues                    | no       | The order preferred where they disagree. |

**In return:** the card `get_scene` returns, for a tag.

### `find_by_fingerprint`

Identifies a file from the hashes held for it.

| Argument       | Type                                                                      | Required | What it does                                                                                                                             |
| -------------- | ------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `fingerprints` | a list of `{ hash, algorithm }`, the algorithm `MD5`, `OSHASH` or `PHASH` | yes      | The hashes to look up.                                                                                                                   |
| `sections`     | any of `basic`, `fingerprints`, `images`                                  | no       | The blocks read beside each card. One call answers a card per record reached, so a block asked for here reaches a reader once per match. |
| `sources`      | list of catalogues                                                        | no       | Read these catalogues alone.                                                                                                             |
| `prefer`       | list of catalogues                                                        | no       | The order preferred where they disagree.                                                                                                 |

**MD5 and OSHASH name the bytes of a file. PHASH states a likeness**, which a
re-encode, a crop or another scene from the same shoot can satisfy: read a PHASH
match as a resemblance rather than as an identity.

**In return:** each record reached, answered as one card read on every catalogue
that holds it.

## What an answer states about the catalogues

Every answer accounts for each catalogue separately, because merging them would
lose what a caller needs. A catalogue that failed, one nobody asked, and one that
answered with nothing are three different things, and they are reported as three.
Counts stay beside the catalogue that produced them and are never added up. On a
card, each value names the catalogues that said it, and a disagreement is
published rather than resolved silently.

## Configuration

A key per catalogue, and everything else optional. All of it goes in the `env`
block of your client config.

| Variable                | Default              | What it does                                                                             |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `STASHBOX_STASHDB_KEY`  | none                 | The key StashDB issues to your account.                                                  |
| `STASHBOX_TPDB_KEY`     | none                 | The key TPDB issues to your account.                                                     |
| `STASHBOX_FANSDB_KEY`   | none                 | The key FansDB issues to your account.                                                   |
| `STASHBOX_PMV_KEY`      | none                 | The key PMV Stash issues to your account.                                                |
| `STASHBOX_JAVSTASH_KEY` | none                 | The key JAVStash issues to your account.                                                 |
| `SB_USER_AGENT`         | the project identity | Names your application to the catalogues, with an address where a person can be reached. |
| `SB_MIN_INTERVAL_MS`    | `1000`               | Gap between two requests, from 1000 to 60000.                                            |
| `SB_TIMEOUT_MS`         | `20000`              | Deadline for one request, from 1 to 600000.                                              |
| `SB_MAX_RETRIES`        | `3`                  | Attempts after a transient failure, from 0 to 10.                                        |
| `SB_CACHE_TTL_MS`       | `300000`             | How long an answer stays in memory, from 0 to 86400000.                                  |
| `SB_CACHE_MAX_ENTRIES`  | `500`                | Answers held in memory at once, from 1 to 100000.                                        |
| `SB_LOG_LEVEL`          | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                                 |

Each catalogue issues its key to a registered account, in that account's
settings. This server ships no key of its own, and each user brings their own. A
value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                         |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `not_found`     | A catalogue answered, and holds no such record.         | Check the identifier with a search.                                                |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                        |
| `rate_limited`  | A catalogue asked this client to slow down.             | Wait, then call again with the same arguments. The record is still there.          |
| `parse_failure` | An answer arrived in a shape this client cannot read.   | Report it at [the issue tracker](https://github.com/smeet666/mcp-stashbox/issues). |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                 |
| `timeout`       | The request passed its deadline.                        | Raise `SB_TIMEOUT_MS`, or ask for fewer rows.                                      |

A catalogue that failed is reported per catalogue rather than failing the whole
answer, so one silent catalogue never hides the others.

## As a library

The layer reading the catalogues is published on its own, with its pacing, its
cache and its errors, and with no protocol attached.

```ts
import { Catalogues } from "mcp-stashbox/client";

const client = new Catalogues();
const read = await client.searchPerformers({ name: "example", limit: 5 });
console.log(read.data.rows.length, read.cached);
```

Each read answers `{ data, cached }`, and throws an error carrying one of the six
codes. The one-second floor between two requests holds here as well.

## Pacing and attribution

Requests go out one at a time with at least a second between them, and that floor
holds however the server is configured. The `User-Agent` always ends with the
project identity and an address where a person can be reached.

Every record carries the address of its page on the catalogue it came from, and a
card carries the link each catalogue publishes to the same record elsewhere. The
catalogues are built by the people who submit and review their records.

This MCP server is an unofficial project, with no affiliation to any of the
catalogues it reads.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts only the catalogues you hold a key for, holds its
answers in memory while it runs, and writes nothing to disk. Your keys are read
from the environment and sent to their own catalogue alone.
[PRIVACY.md](PRIVACY.md) states what a request carries and which settings change
any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
catalogues themselves.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-stashbox/issues). Pull
requests are welcome; opening an issue first helps agree on the shape of the
change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The records belong to the catalogues and to the
people who built them.

---

<a name="mcp-stashbox-français"></a>

# mcp-stashbox (français)

_[English version](#mcp-stashbox)_

Un stash-box est un catalogue de métadonnées partagé : il enregistre des scènes,
les interprètes qui y sont crédités, les studios qui les ont publiées, et les
étiquettes sous lesquelles elles sont rangées, le tout tenu par soumission et
relecture. **Un catalogue ne contient aucun média** — une fiche nomme où quelque
chose a été publié et n'en emporte rien — et il identifie un fichier par les
empreintes calculées dessus. Cinq catalogues de ce type fonctionnent
indépendamment, chacun délivrant sa propre clé à un compte enregistré.

Ce serveur relie un client de conversation à tous à la fois. On peut chercher les
scènes, les interprètes, les studios et les étiquettes de chaque catalogue dont
on détient une clé, lire une fiche sous forme d'une carte unique assemblée depuis
tous les catalogues qui la détiennent, identifier un fichier par ses empreintes,
et demander ce que chaque catalogue a été mesuré répondant. **Il demande une clé
par catalogue**, et ne lit que ceux dont il en a une.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=stashbox&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1zdGFzaGJveCJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=stashbox&config=%7B%22name%22%3A%22stashbox%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-stashbox%22%5D%7D)

**Claude Code**

```bash
claude mcp add stashbox --env STASHBOX_STASHDB_KEY=votre-cle -- npx -y mcp-stashbox
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

```json
{
  "mcpServers": {
    "stashbox": {
      "command": "npx",
      "args": ["-y", "mcp-stashbox"],
      "env": {
        "STASHBOX_STASHDB_KEY": "votre-cle"
      }
    }
  }
}
```

Node 24 ou plus récent est nécessaire. Posez une clé par catalogue à lire ; les
autres sont nommés comme absents de chaque réponse.

### Avec Docker

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
        "ghcr.io/smeet666/mcp-stashbox:2.0.1"
      ]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers les catalogues dont vous détenez les clés, et de ces clés prises
dans votre environnement : aucun volume, aucun port.

### Bundle, sans npm

Téléchargez `mcp-stashbox-2.0.1.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-stashbox/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm à
lancer. Les clés se posent toujours dans la configuration du client.

## Ce qu'on peut demander

- « Quels catalogues est-ce que je lis réellement ? »
- « Trouve les interprètes crédités sous ce nom. »
- « Lis-moi la fiche de ce studio. »
- « Qu'est-ce que ce fichier ? Voici son MD5. »
- « Dans quelles scènes ces deux-là ont-ils joué ensemble ? »

Le chemin ordinaire va d'une recherche à une carte : une ligne porte un `id`
écrit `instance:uuid`, et l'outil de fiche le lit sur chaque catalogue qui le
détient.

## Les catalogues

| Catalogue | Adresse         | Clé                     |
| --------- | --------------- | ----------------------- |
| StashDB   | `stashdb.org`   | `STASHBOX_STASHDB_KEY`  |
| TPDB      | `theporndb.net` | `STASHBOX_TPDB_KEY`     |
| FansDB    | `fansdb.cc`     | `STASHBOX_FANSDB_KEY`   |
| PMV Stash | `pmvstash.org`  | `STASHBOX_PMV_KEY`      |
| JAVStash  | `javstash.org`  | `STASHBOX_JAVSTASH_KEY` |

Ils répondent des surfaces différentes : StashDB répond à toutes les routes que
ce serveur connaît, les autres à moins. `get_sources` dit ce que chacun a été
mesuré répondant et le jour de la mesure. **Un catalogue sans clé est nommé comme
absent de chaque réponse**, si bien qu'une réponse portant les lignes de
certains ne se lit jamais comme l'ensemble.

## Les outils

| Outil                 | Ce qu'il fait                                                    |
| --------------------- | ---------------------------------------------------------------- |
| `get_sources`         | Dit ce que chaque catalogue répond, et quelles clés sont posées. |
| `search_scenes`       | Cherche les scènes de chaque catalogue configuré.                |
| `search_performers`   | Cherche les interprètes.                                         |
| `search_studios`      | Cherche les studios.                                             |
| `search_tags`         | Cherche les étiquettes.                                          |
| `get_scene`           | Lit une scène sous forme d'une carte unique.                     |
| `get_performer`       | Lit un interprète sous forme d'une carte unique.                 |
| `get_studio`          | Lit un studio sous forme d'une carte unique.                     |
| `get_tag`             | Lit une étiquette sous forme d'une carte unique.                 |
| `find_by_fingerprint` | Identifie un fichier par les empreintes qu'on en détient.        |

**Chaque recherche prend deux chemins exclusifs.** `query` interroge l'index
textuel de chaque catalogue, qui lit les mots comme une union. Les arguments
typés resserrent comme une intersection. Écrire les deux est refusé.

### `get_sources`

Dit ce que chaque catalogue configuré a été mesuré répondant, et le jour où sa
surface a été lue. Il ne joint aucun catalogue et ne prend aucun argument.

**En retour :** une entrée par catalogue avec son nom, son préfixe
d'identifiant, la présence d'une clé dans cette installation, la variable à poser
quand il n'y en a pas, et les routes auxquelles il répond. La présence d'une clé
est un fait sur cette installation et ne change rien à ce que le catalogue fait.

### `search_scenes`

Cherche les scènes.

| Argument           | Type                                                                                | Requis | Ce qu'il fait                                      |
| ------------------ | ----------------------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| `query`            | chaîne                                                                              | non    | Des mots pour l'index textuel de chaque catalogue. |
| `title`            | chaîne                                                                              | non    | Des mots que porte un titre.                       |
| `code`             | chaîne                                                                              | non    | La référence propre du studio pour la publication. |
| `alias`            | chaîne                                                                              | non    | Un autre titre sous lequel elle est connue.        |
| `date`             | un jour de calendrier                                                               | non    | La date de publication à comparer.                 |
| `date_compare`     | `on`, `before` ou `after`                                                           | non    | Comment cette date est lue.                        |
| `performer_ids`    | liste d'identifiants                                                                | non    | Les interprètes qui y sont crédités.               |
| `studio_ids`       | liste d'identifiants                                                                | non    | Les studios qui l'ont publiée.                     |
| `parent_studio_id` | un identifiant                                                                      | non    | Un studio sous lequel le studio éditeur se range.  |
| `tag_ids`          | liste d'identifiants                                                                | non    | Les étiquettes sous lesquelles elle est rangée.    |
| `match`            | `all` ou `any`                                                                      | non    | Comment une liste d'identifiants est lue.          |
| `sort`             | `title`, `date`, `duration`, `trending`, `popularity`, `created_at` ou `updated_at` | non    | L'ordre qu'applique le catalogue.                  |
| `direction`        | `asc` ou `desc`                                                                     | non    | Le sens de cet ordre.                              |
| `page`             | entier, 1 à 1000                                                                    | non    | Quelle page de l'ordre propre à chaque catalogue.  |
| `limit`            | entier, 1 à 100                                                                     | non    | Lignes que porte une page d'un catalogue.          |
| `sources`          | liste de catalogues                                                                 | non    | Ne lire que ces catalogues.                        |

**En retour :** des lignes portant l'`id` écrit `instance:uuid`, que `get_scene`
reprend, et ce qui nomme la fiche. Une ligne laisse à la carte le synopsis, les
listes de liens et les horodatages d'édition, dont aucun ne distingue deux
publications. **La réponse dit par catalogue laquelle des trois il a
rencontrées :** un échec, un catalogue que personne n'a interrogé, ou un vide
qu'il a établi. **Les comptes ne sont jamais additionnés entre catalogues.** Une
recherche écrite avec des mots seuls lit les premières lignes que rend chaque
index textuel, ces routes ne prenant aucune page.

### `search_performers`

Cherche les interprètes.

| Argument            | Type                                                                                                                                    | Requis | Ce qu'il fait                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------------------------- |
| `query`             | chaîne                                                                                                                                  | non    | Des mots pour l'index textuel.                      |
| `name`              | chaîne                                                                                                                                  | non    | Des mots que porte un nom.                          |
| `alias`             | chaîne                                                                                                                                  | non    | Un autre nom sous lequel ils sont connus.           |
| `disambiguation`    | chaîne                                                                                                                                  | non    | Ce que le catalogue ajoute pour en distinguer deux. |
| `gender`            | une des valeurs que le catalogue enregistre                                                                                             | non    | Le genre que le catalogue enregistre.               |
| `country`           | un code pays à deux lettres                                                                                                             | non    | Le pays que le catalogue enregistre.                |
| `ethnicity`         | une des valeurs que le catalogue enregistre                                                                                             | non    | L'ethnicité que le catalogue enregistre.            |
| `birth_year`        | entier, 1800 à 2200                                                                                                                     | non    | L'année de naissance.                               |
| `career_start_year` | entier, 1800 à 2200                                                                                                                     | non    | L'année où une carrière s'est ouverte.              |
| `career_end_year`   | entier, 1800 à 2200                                                                                                                     | non    | L'année où une carrière s'est close.                |
| `performed_with`    | un identifiant                                                                                                                          | non    | Quelqu'un à côté de qui ils sont crédités.          |
| `studio_id`         | un identifiant                                                                                                                          | non    | Un studio sur lequel ils sont crédités.             |
| `sort`              | `name`, `birthdate`, `deathdate`, `scene_count`, `career_start_year`, `debut`, `last_scene`, `popularity`, `created_at` ou `updated_at` | non    | L'ordre qu'applique le catalogue.                   |
| `direction`         | `asc` ou `desc`                                                                                                                         | non    | Le sens de cet ordre.                               |
| `page`              | entier, 1 à 1000                                                                                                                        | non    | Quelle page.                                        |
| `limit`             | entier, 1 à 100                                                                                                                         | non    | Lignes que porte une page d'un catalogue.           |
| `sources`           | liste de catalogues                                                                                                                     | non    | Ne lire que ces catalogues.                         |

**`alias` est déclaré et jamais envoyé.** Aucune route à facettes ne l'applique :
une requête qui le porte répond aussi large qu'une requête sans lui, donc il est
laissé de côté et la réponse le nomme comme un resserrement que personne n'a
reçu.

**En retour :** les lignes et la comptabilité par catalogue que rend
`search_scenes`.

### `search_studios`

Cherche les studios.

| Argument     | Type                                 | Requis | Ce qu'il fait                             |
| ------------ | ------------------------------------ | ------ | ----------------------------------------- |
| `query`      | chaîne                               | non    | Des mots pour l'index textuel.            |
| `name`       | chaîne                               | non    | Des mots que porte un nom.                |
| `parent_id`  | un identifiant                       | non    | Un studio sous lequel il se range.        |
| `has_parent` | booléen                              | non    | S'il se range sous un autre.              |
| `sort`       | `name`, `created_at` ou `updated_at` | non    | L'ordre qu'applique le catalogue.         |
| `direction`  | `asc` ou `desc`                      | non    | Le sens de cet ordre.                     |
| `page`       | entier, 1 à 1000                     | non    | Quelle page.                              |
| `limit`      | entier, 1 à 100                      | non    | Lignes que porte une page d'un catalogue. |
| `sources`    | liste de catalogues                  | non    | Ne lire que ces catalogues.               |

**En retour :** les lignes et la comptabilité par catalogue de `search_scenes`.

### `search_tags`

Cherche les étiquettes.

| Argument      | Type                                 | Requis | Ce qu'il fait                             |
| ------------- | ------------------------------------ | ------ | ----------------------------------------- |
| `query`       | chaîne                               | non    | Des mots pour l'index textuel.            |
| `name`        | chaîne                               | non    | Des mots que porte un nom.                |
| `category_id` | un identifiant                       | non    | Une catégorie dont l'étiquette relève.    |
| `sort`        | `name`, `created_at` ou `updated_at` | non    | L'ordre qu'applique le catalogue.         |
| `direction`   | `asc` ou `desc`                      | non    | Le sens de cet ordre.                     |
| `page`        | entier, 1 à 1000                     | non    | Quelle page.                              |
| `limit`       | entier, 1 à 100                      | non    | Lignes que porte une page d'un catalogue. |
| `sources`     | liste de catalogues                  | non    | Ne lire que ces catalogues.               |

**En retour :** les lignes et la comptabilité par catalogue de `search_scenes`.

### `get_scene`

Lit une scène sous forme d'une carte unique.

| Argument   | Type                                    | Requis | Ce qu'il fait                        |
| ---------- | --------------------------------------- | ------ | ------------------------------------ |
| `id`       | un identifiant écrit `instance:uuid`    | oui    | La fiche à lire.                     |
| `sections` | parmi `basic`, `fingerprints`, `images` | non    | Les blocs lus à côté de la carte.    |
| `sources`  | liste de catalogues                     | non    | Ne lire que ces catalogues.          |
| `prefer`   | liste de catalogues                     | non    | L'ordre préféré là où ils divergent. |

**En retour :** une carte, lue sur chaque catalogue qui détient la fiche et
atteinte par le lien que chacun publie vers la même fiche ailleurs. **Chaque
valeur nomme les catalogues qui l'ont dite**, et là où ils divergent, la lecture
que personne n'a préférée est publiée à côté de celle qui l'emporte. Omis,
l'ordre propre du registre s'applique, et chaque carte énonce l'ordre appliqué.

### `get_performer`

Lit un interprète sous forme d'une carte unique.

| Argument   | Type                                             | Requis | Ce qu'il fait                        |
| ---------- | ------------------------------------------------ | ------ | ------------------------------------ |
| `id`       | un identifiant écrit `instance:uuid`             | oui    | La fiche à lire.                     |
| `sections` | parmi `basic`, `appearance`, `images`, `studios` | non    | Les blocs lus à côté de la carte.    |
| `sources`  | liste de catalogues                              | non    | Ne lire que ces catalogues.          |
| `prefer`   | liste de catalogues                              | non    | L'ordre préféré là où ils divergent. |

`studios` est la table entière des studios sur lesquels ils sont crédités, qui
fait des centaines de lignes.

**En retour :** la carte que rend `get_scene`, pour un interprète.

### `get_studio`

Lit un studio sous forme d'une carte unique.

| Argument  | Type                                 | Requis | Ce qu'il fait                        |
| --------- | ------------------------------------ | ------ | ------------------------------------ |
| `id`      | un identifiant écrit `instance:uuid` | oui    | La fiche à lire.                     |
| `sources` | liste de catalogues                  | non    | Ne lire que ces catalogues.          |
| `prefer`  | liste de catalogues                  | non    | L'ordre préféré là où ils divergent. |

**En retour :** la carte que rend `get_scene`, pour un studio.

### `get_tag`

Lit une étiquette sous forme d'une carte unique.

| Argument  | Type                                 | Requis | Ce qu'il fait                        |
| --------- | ------------------------------------ | ------ | ------------------------------------ |
| `id`      | un identifiant écrit `instance:uuid` | oui    | La fiche à lire.                     |
| `sources` | liste de catalogues                  | non    | Ne lire que ces catalogues.          |
| `prefer`  | liste de catalogues                  | non    | L'ordre préféré là où ils divergent. |

**En retour :** la carte que rend `get_scene`, pour une étiquette.

### `find_by_fingerprint`

Identifie un fichier par les empreintes qu'on en détient.

| Argument       | Type                                                                        | Requis | Ce qu'il fait                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fingerprints` | une liste de `{ hash, algorithm }`, l'algorithme `MD5`, `OSHASH` ou `PHASH` | oui    | Les empreintes à chercher.                                                                                                                                  |
| `sections`     | parmi `basic`, `fingerprints`, `images`                                     | non    | Les blocs lus à côté de chaque carte. Un appel rend une carte par fiche atteinte, donc un bloc demandé ici parvient au lecteur une fois par correspondance. |
| `sources`      | liste de catalogues                                                         | non    | Ne lire que ces catalogues.                                                                                                                                 |
| `prefer`       | liste de catalogues                                                         | non    | L'ordre préféré là où ils divergent.                                                                                                                        |

**MD5 et OSHASH nomment les octets d'un fichier. PHASH énonce une ressemblance**,
qu'un ré-encodage, un recadrage ou une autre scène du même tournage peuvent
satisfaire : lisez une correspondance PHASH comme une ressemblance plutôt que
comme une identité.

**En retour :** chaque fiche atteinte, rendue comme une carte lue sur chaque
catalogue qui la détient.

## Ce qu'une réponse dit des catalogues

Chaque réponse rend compte de chaque catalogue séparément, parce que les fondre
perdrait ce dont un appelant a besoin. Un catalogue qui a échoué, un que personne
n'a interrogé et un qui a répondu vide sont trois choses différentes, et elles
sont rapportées comme trois. Les comptes restent à côté du catalogue qui les a
produits et ne sont jamais additionnés. Sur une carte, chaque valeur nomme les
catalogues qui l'ont dite, et un désaccord est publié plutôt que tranché en
silence.

## Configuration

Une clé par catalogue, et tout le reste facultatif. Tout se pose dans le bloc
`env` de la configuration du client.

| Variable                | Défaut               | Ce qu'elle fait                                                                          |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `STASHBOX_STASHDB_KEY`  | aucun                | La clé que StashDB délivre à votre compte.                                               |
| `STASHBOX_TPDB_KEY`     | aucun                | La clé que TPDB délivre à votre compte.                                                  |
| `STASHBOX_FANSDB_KEY`   | aucun                | La clé que FansDB délivre à votre compte.                                                |
| `STASHBOX_PMV_KEY`      | aucun                | La clé que PMV Stash délivre à votre compte.                                             |
| `STASHBOX_JAVSTASH_KEY` | aucun                | La clé que JAVStash délivre à votre compte.                                              |
| `SB_USER_AGENT`         | l'identité du projet | Nomme votre application auprès des catalogues, avec une adresse où joindre une personne. |
| `SB_MIN_INTERVAL_MS`    | `1000`               | Écart entre deux requêtes, de 1000 à 60000.                                              |
| `SB_TIMEOUT_MS`         | `20000`              | Délai d'une requête, de 1 à 600000.                                                      |
| `SB_MAX_RETRIES`        | `3`                  | Tentatives après un échec passager, de 0 à 10.                                           |
| `SB_CACHE_TTL_MS`       | `300000`             | Durée pendant laquelle une réponse reste en mémoire, de 0 à 86400000.                    |
| `SB_CACHE_MAX_ENTRIES`  | `500`                | Réponses gardées en mémoire à la fois, de 1 à 100000.                                    |
| `SB_LOG_LEVEL`          | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.                      |

Chaque catalogue délivre sa clé à un compte enregistré, dans les réglages de ce
compte. Ce serveur n'embarque aucune clé, et chacun apporte les siennes. Une
valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                    | Que faire                                                                                |
| --------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `not_found`     | Un catalogue a répondu, et n'a pas cette fiche.       | Vérifiez l'identifiant avec une recherche.                                               |
| `invalid_input` | Les arguments ont été refusés avant toute requête.    | Lisez le message, qui nomme l'argument.                                                  |
| `rate_limited`  | Un catalogue demande à ce client de ralentir.         | Attendez, puis rappelez avec les mêmes arguments. La fiche est toujours là.              |
| `parse_failure` | Une réponse est arrivée dans une forme illisible ici. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-stashbox/issues). |
| `network_error` | La requête n'a pas abouti.                            | Réessayez sous peu.                                                                      |
| `timeout`       | La requête a dépassé son délai.                       | Augmentez `SB_TIMEOUT_MS`, ou demandez moins de lignes.                                  |

Un catalogue qui échoue est rapporté catalogue par catalogue plutôt que de faire
échouer toute la réponse, donc un catalogue silencieux n'en cache jamais
d'autres.

## Comme bibliothèque

La couche qui lit les catalogues est publiée seule, avec son rythme, son cache et
ses erreurs, sans protocole attaché.

```ts
import { Catalogues } from "mcp-stashbox/client";

const client = new Catalogues();
const read = await client.searchPerformers({ name: "example", limit: 5 });
console.log(read.data.rows.length, read.cached);
```

Chaque lecture répond `{ data, cached }`, et lève une erreur portant un des six
codes. Le plancher d'une seconde entre deux requêtes tient également ici.

## Rythme et attribution

Les requêtes partent une à une avec au moins une seconde entre elles, et ce
plancher tient quelle que soit la configuration. Le `User-Agent` se termine
toujours par l'identité du projet et une adresse où joindre une personne.

Chaque fiche porte l'adresse de sa page sur le catalogue d'où elle vient, et une
carte porte le lien que chaque catalogue publie vers la même fiche ailleurs. Les
catalogues sont bâtis par ceux qui soumettent et relisent leurs fiches.

Ce MCP est un projet non officiel, sans affiliation à aucun des catalogues qu'il
lit.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que les catalogues dont vous détenez une clé, garde ses
réponses en mémoire le temps qu'il tourne, et n'écrit rien sur le disque. Vos
clés sont lues dans l'environnement et envoyées à leur seul catalogue.
[PRIVACY.md](PRIVACY.md) dit ce qu'une requête emporte et quels réglages changent
cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre les catalogues eux-mêmes.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-stashbox/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les fiches appartiennent aux catalogues et à ceux
qui les ont bâties.
