# Security

## Reporting

Report a vulnerability through GitHub's private advisory form on this repository,
or by opening an issue if the matter is not sensitive.

## What this server does, and does not do

It reads. It sends no data anywhere except the catalogues it is configured for,
writes nothing to them, and stores nothing on disk. The in-memory store holds
parsed records for the lifetime of the process.

**API keys** are read from the environment and travel in a request header to the
catalogue that issued them. They are never logged, never written to disk, and
never included in an error message: a refusal names the variable to set rather
than the value it holds.

**Third-party text reaches a model**, and it is guarded in two ways, because it
arrives in two shapes.

A value placed inside a line the server writes has its line breaks collapsed to
spaces before it is rendered. It therefore cannot begin a line of its own, which
is what a forged note or a forged heading would need. This covers every value a
catalogue publishes without exception: a title, a name, an alias, a tag, an
address a record links to, the address of an image, and a fingerprint hash.

A value that opens a line, such as the name a record's answer begins with, is
shifted two spaces where it opens the way a line of the server's opens. That is
read as a shape, a word or two then a colon, rather than as a list of the
spellings somebody thought of: the server writes more openings than such a list
holds, and a list goes stale the day a renderer gains a line.

A block of a catalogue's own prose, such as a scene's description, is indented
whole. Every line of it is shifted, whatever it says, so no line of it can begin
where a line of the server's begins. Indenting the block rather than recognising
particular openings leaves no question of which spellings count.

The structured payload keeps the text exactly as published.

**Addresses are built from identifiers that a catalogue could have minted.** A
record whose identifier is not a UUID is treated as unreadable and left out, with
the row counted as skipped, and every identifier is escaped as it enters an
address. This holds for identifiers arriving from a catalogue as well as from a
caller: both are checked, since neither is written here.

**An identifier that no catalogue could have minted is refused**, on every
argument that takes one. An identifier that names no catalogue is refused when
several are configured, since sending it to all of them would answer about a
different record on each.
