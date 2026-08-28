# Privacy

This server collects nothing about you, and sends nothing to its author.

_[Version française](#confidentialité)_

---

## What this server is

`mcp-stashbox` is a read-only client for [the public stash-box metadata catalogues](https://stashdb.org). It runs on your
own machine, as a process your MCP host starts, and it speaks over stdio. It
listens on no port.

**This server sends credentials, because each catalogue requires its own.** Every catalogue issues a key to a registered account, and you supply the ones you hold. **A key travels only to the catalogue that issued it**, never to another. Keys are read from the environment, held in memory for the life of the process, and written nowhere. A catalogue you gave no key for is named as absent from every answer.

## What leaves your machine, and where it goes

**5 hosts are contacted**, and nothing else.

| Host            | What is read there |
| --------------- | ------------------ |
| `stashdb.org`   | StashDB            |
| `theporndb.net` | ThePornDB          |
| `fansdb.cc`     | FansDB             |
| `pmvstash.org`  | PMV Stash          |
| `javstash.org`  | JAVStash           |

What a request carries:

| What                                | Why it is there                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| The question you asked              | A search term or an identifier reaches the site as you wrote it.                                                                       |
| A `User-Agent`                      | `mcp-stashbox/<version> (+https://github.com/smeet666/mcp-stashbox)`, so a catalogue can reach a person about the traffic it receives. |
| Your IP address                     | Sent by your network to any host you contact, as with any web request.                                                                 |
| The key of the catalogue being read | Each catalogue refuses an anonymous read. A key goes to the catalogue that issued it and to no other.                                  |

Your requests reach the public stash-box metadata catalogues. What is done with them there is governed by each site's own privacy policy, which this project does not control.

## What is kept, and for how long

**Answers are held in memory only, and only while the server runs.** The cache is
a table in the process: it holds what was read so that reading the same page
twice costs one request instead of two. Closing the server empties it.

**Nothing is written to disk.** The server creates no file, no database and no
log file.

## What is never collected

- No analytics, no telemetry, no usage counter.
- Nothing is sent to the author of this project or to any third party.
- No account, no profile, no identifier is created for you.
- Your questions are not stored, forwarded, or used to train anything.

## Logs

The server writes diagnostics to **stderr**, where your MCP host decides what
becomes of them. `SB_LOG_LEVEL` governs how much is written and defaults to `error`. These lines stay on your machine.

## The settings that change any of this

| Variable          | What it changes                                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `SB_USER_AGENT`   | Adds your own identifier in front of this project's, which stays appended so the site can always reach a person. |
| `SB_CACHE_TTL_MS` | How long an answer is held in memory. `0` turns the cache off.                                                   |
| `SB_LOG_LEVEL`    | How much is written to stderr.                                                                                   |

## Children

This server is a tool for developers and it is not directed at children.

## Changes

A change to this policy travels in a release, and the changelog names it.

## Contact

Open an issue on [the repository](https://github.com/smeet666/mcp-stashbox/issues). For something exploitable,
follow [SECURITY.md](./SECURITY.md) instead.

---

# Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur.

## Ce qu'est ce serveur

`mcp-stashbox` est un client en lecture seule pour [les catalogues de métadonnées stash-box publics](https://stashdb.org). Il
tourne sur votre machine, comme un processus que votre hôte MCP démarre, et il
parle en stdio. Il n'écoute sur aucun port.

**Ce serveur envoie des identifiants, parce que chaque catalogue exige le sien.** Chaque catalogue délivre une clé à un compte inscrit, et vous fournissez celles que vous détenez. **Une clé ne voyage que vers le catalogue qui l'a délivrée**, jamais vers un autre. Les clés sont lues dans l'environnement, gardées en mémoire le temps du processus, et écrites nulle part. Un catalogue pour lequel vous n'avez donné aucune clé est nommé comme absent de chaque réponse.

## Ce qui quitte votre machine, et où cela va

**5 hôtes sont joints**, et rien d'autre.

| Hôte            | Ce qui y est lu |
| --------------- | --------------- |
| `stashdb.org`   | StashDB         |
| `theporndb.net` | ThePornDB       |
| `fansdb.cc`     | FansDB          |
| `pmvstash.org`  | PMV Stash       |
| `javstash.org`  | JAVStash        |

Ce qu'une requête emporte :

| Quoi                          | Pourquoi                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| La question posée             | Un terme de recherche ou un identifiant atteint le site tel que vous l'avez écrit.                                                                      |
| Un `User-Agent`               | `mcp-stashbox/<version> (+https://github.com/smeet666/mcp-stashbox)`, pour qu'un catalogue puisse joindre une personne au sujet du trafic qu'il reçoit. |
| Votre adresse IP              | Transmise par votre réseau à tout hôte que vous joignez, comme pour n'importe quelle requête web.                                                       |
| La clé du catalogue interrogé | Chaque catalogue refuse une lecture anonyme. Une clé va vers le catalogue qui l'a délivrée et vers aucun autre.                                         |

Vos requêtes atteignent les catalogues de métadonnées stash-box publics. Ce qui en est fait là-bas relève de la politique de confidentialité propre à chaque site, que ce projet ne contrôle pas.

## Ce qui est conservé, et combien de temps

**Les réponses sont gardées en mémoire seulement, et seulement pendant que le
serveur tourne.** Le cache est une table dans le processus : il retient ce qui a
été lu pour que lire deux fois la même page coûte une requête plutôt que deux.
Fermer le serveur le vide.

**Rien n'est écrit sur le disque.** Le serveur ne crée aucun fichier, aucune base
et aucun journal.

## Ce qui n'est jamais collecté

- Aucune analyse d'audience, aucune télémétrie, aucun compteur d'usage.
- Rien n'est envoyé à l'auteur de ce projet ni à un tiers.
- Aucun compte, aucun profil, aucun identifiant n'est créé pour vous.
- Vos questions ne sont ni stockées, ni transmises, ni utilisées pour entraîner
  quoi que ce soit.

## Les journaux

Le serveur écrit ses diagnostics sur **stderr**, où votre hôte MCP décide de ce
qu'ils deviennent. `SB_LOG_LEVEL` règle leur quantité et vaut `error` par défaut. Ces lignes restent sur votre machine.

## Les réglages qui changent tout cela

| Variable          | Ce qu'elle change                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `SB_USER_AGENT`   | Ajoute votre identifiant devant celui du projet, qui reste accolé pour que le site puisse toujours joindre une personne. |
| `SB_CACHE_TTL_MS` | Combien de temps une réponse est gardée en mémoire. `0` éteint le cache.                                                 |
| `SB_LOG_LEVEL`    | La quantité écrite sur stderr.                                                                                           |

## Les enfants

Ce serveur est un outil pour développeurs et ne s'adresse pas aux enfants.

## Les évolutions

Une modification de cette politique voyage dans une version, et le changelog la
nomme.

## Contact

Ouvrez une issue sur [le dépôt](https://github.com/smeet666/mcp-stashbox/issues). Pour quelque chose
d'exploitable, suivez plutôt [SECURITY.md](./SECURITY.md).
