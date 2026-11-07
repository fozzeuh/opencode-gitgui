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

## Phase 3 — Commit file visualization

**Date:** 2026-11-07

Goal: show which files a selected commit changed, without leaving the graph.

### Git backend

- New `commitFiles` RPC method and `readCommitFiles` reader.
- Files and statuses come from `git diff-tree -r -M --name-status -z`; line
  counts and binary detection come from the matching `--numstat -z` output.
- NUL-separated parsing keeps paths with spaces, tabs, or newlines intact.
- Merge commits are compared against their first parent; root commits use
  `--root` so their initial files are listed.
- Rename and copy detection is enabled with `-M`; the response keeps the
  previous path alongside the new one.
- Status mapping covers added, modified, deleted, renamed, copied, type-changed,
  and unknown records.
- Each request returns at most 500 files with a `truncated` flag, on top of the
  existing 10-second timeout and 4 MiB output cap.
- New `commitFileDiff` RPC method and `readCommitFileDiff` reader.
- Diffs use `git diff` against the first parent, or `git show` for root commits,
  with three lines of context.
- Renamed and copied files pass both paths to Git so the patch keeps its rename
  metadata.
- Patches are capped at 256 KiB with a `truncated` flag; binary files are
  detected from Git's output.

### GUI

- The commit detail card now includes a **Files changed** section.
- Header shows the file count and total additions/deletions.
- Each file row shows a colored status badge, the path (with `old → new` for
  renames), and its additions/deletions or a **Binary** marker.
- File rows are clickable and keyboard accessible; selecting one opens its
  unified diff below the list.
- The diff viewer colors additions, deletions, and hunk headers, scrolls
  independently, and handles binary, empty, truncated, and error states.
- Long file lists scroll inside the detail card so the graph layout stays
  stable; truncation is called out explicitly.
- Files and containing branches are fetched independently, so one failure does
  not hide the other section.
- New English i18n strings for the file and diff sections.

### Tests

- Unit tests for the NUL-separated name-status and numstat parsers, including
  renames, binary files, and malformed records.
- Integration tests against temporary repositories for added and modified
  files, root-commit diffs, rename diffs, binary diffs, and a merge commit
  compared against its first parent.
- The suite now has 17 tests.

### Documentation

- README status, API table, and limits updated for commit file inspection.
- The current-status table below moves commit files out of the pending list.

## Documentation workflow — 2026-11-07

- Added `AGENTS.md` requiring every commit to update `docs/changelog.md` in the
  same commit, and to keep `README.md` in sync when behavior or structure
  changes.
- Recorded the change here as the first application of the rule.
- Commit hashes are not guessed: entries are written before the commit exists,
  and hashes are added later only when useful.

## Graph readability — 2026-11-07

Goal: make merged branches and branch colors readable at a glance.

### Merge visibility

- The graph engine now marks each edge with its parent index and whether it is an
  extra (merge) parent, and marks merge rows explicitly.
- Merge commits are drawn with an outer ring so they stand out from regular
  commits.
- Merge edges are dashed, thicker at the join, and end with an arrow pointing at
  the merged parent, so the line visibly enters the branch it was merged from.
  Their color follows the merged branch rather than the merge commit's lane.
- Merge rows also carry a small `merge` badge next to the hash.
- Branch tips now render colored pills directly in the commit row, using the
  same colors as the branch list at the top.
- Lane layout was rewritten to draw the classic side-branch shape. Pending
  parents are tracked per lane, the first parent continues the current lane,
  merge parents open a lane on the right, and a lane that reaches a parent
  already tracked by another lane joins the leftmost lane. This matters with
  `git log --topo-order`, which emits feature commits before the main-line
  commit at their fork point: the old algorithm then dragged the main line onto
  the side lane instead of showing the feature lane rejoining it.
- Edges are connected after every lane is assigned, so a join always targets the
  final parent lane and a merged branch visibly returns to the main line.

### Branch colors on the graph

- Branch colors are no longer a direct lane-index lookup. The layout now records
  whether a commit opened its lane, and the GUI propagates each branch tip color
  down its first-parent line until another branch tip takes over.
- The result is visible on the graph itself: a feature branch segment and the
  older `main` segment get different node and line colors even when they share a
  single lane. Previously every dot on a linear chain used lane 0's blue.
- Merge links, the merged branch line, the commit nodes, and the branch pills all
  share the same color, so a merge can be followed from its badge to its parent.
- Lane-index colors remain the fallback for branches whose tip is outside the
  loaded page.
- A deterministic branch color map seeds each branch from a hash of its name and
  resolves collisions by taking the next free palette slot, so visible branches
  get distinct colors that stay stable across refreshes and pagination.
- The shared palette grew from 6 to 10 colors, and graph lanes use the same
  palette, keeping lines and labels visually consistent.
- New `src/gui/colors.ts` (palette, branch color assignment, and graph color
  propagation) and `src/gui/branch-pill.tsx` (shared branch badge for the header,
  commit rows, and containing-branch list).

### Tests

- Graph layout tests now cover the parent index, lane starts, merge markers, and
  the side-branch join produced by `git log --topo-order`.
- New tests cover lane color cycling, branch color stability/distinctness, and
  the graph color transitions at branch tips and merge links.
- The suite has 20 tests and `npm run check` passes.

## Fetch all — 2026-11-07

Goal: let users update remote-tracking refs from the graph without leaving the
panel.

### Git backend and RPC

- Added a typed `fetchAll` RPC endpoint. The server validates the absolute
  repository path and runs the fixed argument list `git fetch --all` with the
  shell disabled; no command or remote is accepted from the GUI.
- Fetch is only run after an explicit button click. It updates refs from all
  configured remotes, does not prune stale refs, and does not change the checked
  out branch or working tree.
- Fetch has a 120-second timeout; existing read commands keep their 10-second
  timeout.

### GUI

- Added a **Fetch all** button beside **Refresh**.
- The button shows a busy state and the panel reports progress, success, or the
  Git error. On success, the graph and branch list refresh automatically so new
  remote refs and commits become visible.

### Tests and documentation

- Added an integration test using a local bare remote to verify that fetch
  updates the remote-tracking branch without network access.
- README now documents the explicit network action, its behavior, and its limit.
- `npm run check` passes.

## Current status against the original brief

| Original feature | Status |
| --- | --- |
| Native V2 panel and RPC | Done |
| Multi-branch history and pagination | Done |
| Local and remote branches | Done |
| Current branch / HEAD indicator | Partial: current branch is shown; detached HEAD label planned |
| Merge and parent-child relationships | Done |
| Tags | Not yet |
| Commit selection details | Partial: metadata, containing branches, changed files and stats; full patch not yet |
| File diffs with syntax highlighting | Partial: unified diff viewer with line colors; syntax highlighting not yet |
| Search by message or hash | Not yet |
| Filter by branch | Not yet |
| Git actions (checkout, cherry-pick, revert, reset, push, fetch, pull) | Partial: explicit Fetch all updates configured remotes; other actions not yet |
| Confirmation flows for destructive actions | Not yet |
| Closable tab and launcher | Not yet; tab is pinned |

## Next steps

1. Tags and ref badges on commits.
2. Syntax highlighting inside the diff viewer.
3. Search and branch filtering.
4. Action layer with explicit confirmation for destructive operations.
5. Closable tab driven by a launcher.
6. Error and conflict handling hardening.
