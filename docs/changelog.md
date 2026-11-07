# Changelog

Chronological record of the work done on OpenCode Git Graph. The original brief
is kept verbatim in [initial-request.md](./initial-request.md).

## Phase 1 — Foundations and native integration

**Commit:** `f25dfc5` — `feat: initialiser le plugin Git Graph V2 (phase 1)`
**Date:** 2026-11-06

Goal: prove the plugin is loaded by OpenCode Desktop V2, that the panel opens,
and that GUI/server RPC works end to end.

Delivered:

- Project scaffold: strict TypeScript, SolidJS, Vite, Vitest, ESLint.
- Server plugin entry using `Plugin.define` from `@opencode/plugin`.
- GUI plugin entry using `Plugin.define` from `@opencode/plugin/gui`, built as a
  prebuilt CommonJS bundle (`dist/gui-experimental.cjs`).
- `Git Graph` side panel registered as `git-graph:graph`, pinned and not
  closable so it is always visible during validation.
- Panel launcher: side panel menu item and command palette entry
  (`Git Graph: Open panel`, `mod+shift+g`).
- Typed `ping` RPC proving the GUI → server → GUI round trip.
- Native i18n, icons, and layout primitives where available.
- Local installation documented and validated in OpenCode Desktop 2.2.5.

Verification: panel and RPC confirmed in the real Desktop application.

## Phase 2 — Repository reading, graph, and commit inspection

**Commit:** `3d77c09` — `feat: add multi-branch Git graph for OpenCode V2`
**Date:** 2026-11-06

Goal: turn the validated shell into a usable read-only Git graph.

### Git backend

- Safe Git CLI runner built on `node:child_process.spawn("git", args)` with
  `shell: false`; arguments are always passed separately.
- Absolute repository path validation, 10-second timeout, 4 MiB stdout cap.
- Commit history via `git log --all --topo-order` with a custom `%x00`/`%x1e`
  record format (hash, parents, author, timestamp, subject, refs).
- Pagination support: 50 commits per GUI page, 100 commits maximum per RPC call,
  offset capped at 10,000.
- Branch listing via `git for-each-ref`, including local branches, remote
  branches, and the checked-out branch.
- Branch membership via `git for-each-ref --contains=<hash>` to show which
  current branches contain the selected commit. Git does not record the branch a
  commit was created on, so this is the only correct interpretation.

### Graph engine

- Pure TypeScript lane layout, independent of SolidJS and unit tested.
- Stable lanes for parallel branches, visible parent edges, merge handling, and
  dangling edges for parents outside the loaded page.

### GUI

- Multi-branch commit list rendered with SVG lanes, nodes, and merge links.
- Commit rows show graph node, subject, author, date, and refs.
- Commit selection opens an inline detail card under the selected row with full
  hash, short hash, author, date, parents, and containing branches.
- Detail card height is measured from its content with `ResizeObserver`; the
  graph shifts rows by the real height instead of reserving a fixed block.
- Branch list and containing-branch list combine a local branch and its remote
  counterpart when the name and commit match (for example `main · origin/main`),
  matching VS Code Git Graph's default behaviour. Divergent remote branches stay
  separate, and `origin/HEAD` is ignored.
- Branch colors follow the visible graph lane when the branch tip is loaded,
  otherwise a stable palette color.
- Manual refresh, loading and error states, and a **Load more** button.

### Tests and quality

- Unit tests for the Git log and branch parsers, branch label combination, and
  graph layout.
- Integration tests against temporary repositories: multiple branches, a
  feature-only commit, remote refs, pagination, and containing-branch queries.
- No test touches a personal development repository.

### Documentation and language

- README rewritten in English.
- UI strings, Git errors, and commit messages moved to English.
- This `docs/` directory added with the initial request and this changelog.

Verification: `npm run check` passes (typecheck, lint, 13 tests, build);
OpenCode configuration reloaded and the panel checked in Desktop.

## Current status against the original brief

| Original feature | Status |
| --- | --- |
| Native V2 panel and RPC | Done |
| Multi-branch history and pagination | Done |
| Local and remote branches | Done |
| Current branch / HEAD indicator | Partial: current branch is shown; detached HEAD label planned |
| Merge and parent-child relationships | Done |
| Tags | Not yet |
| Commit selection details | Partial: metadata and containing branches; files and stats not yet |
| File diffs with syntax highlighting | Not yet |
| Search by message or hash | Not yet |
| Filter by branch | Not yet |
| Git actions (checkout, cherry-pick, revert, reset, push, fetch, pull) | Not yet; intentionally read-only |
| Confirmation flows for destructive actions | Not yet |
| Closable tab and launcher | Not yet; tab is pinned |

## Next steps

1. Tags and ref badges on commits.
2. Commit files, diff stats, and diff viewer.
3. Search and branch filtering.
4. Action layer with explicit confirmation for destructive operations.
5. Closable tab driven by a launcher.
6. Error and conflict handling hardening.
