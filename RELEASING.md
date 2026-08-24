# Releasing

One version at a time, in this order.

1. **Bump** the version in `package.json`, `src/version.ts`, `server.json`
   (both the top level and the npm package entry) and `packaging/manifest.json`.
2. **Write the changelog entry.** Several fixes that accumulated without being
   released are packed into one version and one entry rather than four releases
   at once.
3. `npm run typecheck && npm test && npm run build`.
4. **Publish to npm.** By hand for the first release of a package that does not
   exist yet, since trusted publishing cannot be configured against an unknown
   name. Afterwards through the workflow, under the repository's OIDC identity,
   with no token stored anywhere.
   **The bundle is built by the tag, not by `npm run build`.** `npm run build`
   writes `dist/`, which is what npm serves and what the tests read. The single-file
   bundle has a configuration of its own (`tsup.bundle.config.ts`) and is built in
   the workflow, so a `dist-bundle/` sitting in a working copy can be any age at
   all. Reading it to decide what a release contains is reading the wrong artefact:
   download the `.mcpb` from the release and run the server inside it.

5. **Tag**, which builds the bundle, cuts the GitHub release and files the
   registry entry.
6. **The official registry.** Its description is capped at 100 characters and it
   refuses anything longer. The bundle URL carries a version number and is
   computed at publish time rather than written by hand, since a hand-written one
   survives version bumps and serves an older bundle than the one announced.
7. **Third-party directories.** A pull request to the awesome list, and a
   `LAUNCHGUIDE.md` at the root for the marketplace.

**Verify before announcing.** One-click install links encode the package name,
and defaults quoted in the README are read from `config.ts` rather than from
memory.
