# Contributing

## The rule everything else follows from

**A server never says something the data does not carry.** A refusal is not an
absence, a null is not a zero, and a count is named for what it counts on the
catalogue that produced it.

## Working on this

```bash
npm install
npm run build:fixtures
npm test
npm run typecheck
```

**Tests come first.** A defect is fixed by writing the test that states the right
answer, then correcting the source. A test written afterwards proves only what
the code already does.

**Tests are deterministic or they do not exist.** Anything touching time uses
fake timers with a pinned epoch. No tolerance constants, no wall-clock
measurement. A test that passes only on a fast machine is rewritten or deleted.

**Fixtures are generated, never captured.** `scripts/build-fixtures.mjs` writes an
invented corpus, so no third party's records live in this repository and no test
drifts with live data.

## Writing

Every comment, README line and tool description is read by someone who has never
seen an earlier version of this project. Describe what the code does and **why**,
never how it differs from a past state.

Comment an invariant or a reason. If a function is called `readContested`, do not
write "reads whether it is contested".
