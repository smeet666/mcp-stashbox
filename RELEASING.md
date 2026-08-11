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
5. **Tag**, which builds the bundle, cuts the GitHub release and files the
   registry entry.
6. **The official registry.** Its description is capped at 100 characters and it
   refuses anything longer. The bundle URL carries a version number and is
   computed at publish time rather than written by hand, since a hand-written one
   survives version bumps and serves an older bundle than the one announced.
7. **Glama.** Indexing happens on its own; claiming the server, setting the build
   spec and cutting a release need a signed-in session. Run `Build` alone, then
   `Make Release` with the real version number.
8. **Third-party directories.** A pull request to the awesome list, and a
   `LAUNCHGUIDE.md` at the root for the marketplace.

**Verify before announcing.** One-click install links encode the package name,
and defaults quoted in the README are read from `config.ts` rather than from
memory.
