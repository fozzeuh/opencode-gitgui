# OpenCode Git Graph

A native GUI plugin for **OpenCode Desktop V2**. It adds a `Git Graph` side
panel and a typed RPC bridge between the SolidJS GUI and the server plugin.

> OpenCode V2 only. OpenCode V1 is not supported.

## Status — Phase 5 (in progress)

Phase 1 validated plugin loading, opening the panel, and RPC transport. Phase 2
added repository reading and an interactive SVG graph. Phase 3 added commit file
inspection. Phase 4 completed the read-only explorer. Phase 5 adds
syntax-highlighted diffs and the confirmed Git action layer:

- Multi-branch history loaded 300 commits at a time, with a **Load more** button
  that appends 100 more commits per request.
- Local and remote branch labels, combined when they have the same name and
  point to the same commit; the checked-out branch is indicated.
- Tags are read separately and shown as badges on the commits they point at,
  including annotated tags peeled to their commit.
- The current `HEAD` commit is marked in the list, and a detached checkout shows
  the short hash beside the **Detached HEAD** label.
- Search by commit message or hash against the full repository history, not only
  the loaded page. Results update as you type after 2 characters, with a 300 ms
  debounce; Enter applies the query immediately, and clearing the field restores
  the full history.
- Filter the history by any local or remote branch; search and filter combine.
- Branches containing the selected commit, with colors linked to a stable
  per-branch palette rather than graph lanes.
- SVG commit graph whose nodes and line segments follow the branch color, so a
  feature branch stays visually distinct from `main` even on a linear history.
- Classic side-branch layout: a merged branch leaves the main line, runs beside
  it, and visibly rejoins at the fork point.
- Merge commits use an outer ring, dashed merge links, and an arrow that points
  into the merge commit, showing the side branch flowing into it.
- Branch tips are shown as colored pills directly on the commit rows.
- Select a commit to view its author, date, hash, parents, tags, and the files it
  changed.
- Changed files show their status (added, modified, deleted, renamed, copied,
  type change), rename source, additions and deletions, and a binary marker.
- Click a changed file to open its unified diff against the first parent, with
  colored additions, deletions, and hunk headers.
- Diff lines are syntax highlighted for common languages (TypeScript/JavaScript,
  JSON, CSS/SCSS, HTML/XML, shell, Python, Ruby, Go, Rust, C-family, PHP, Swift,
  Kotlin, SQL, Lua, YAML, TOML). Files with an unknown type stay plain text.
- **Refresh** repository data manually, or click **Fetch all** to fetch from all
  configured remotes and then refresh the graph and branch list.
- Working tree state is shown under the current branch: clean, number of
  uncommitted entries, conflict count, and any merge, cherry-pick, revert, or
  rebase left in progress.
- The **Actions** menu checks out another local branch, pushes the current
  branch to a configured remote, or pulls its upstream. The commit detail card
  checks out a commit in detached HEAD, cherry-picks it, reverts it, or resets
  the current branch to it with soft, mixed, or hard mode.
- Every write action asks for confirmation. A dirty-tree checkout, a detached
  checkout, and a hard reset use a destructive confirmation; a hard reset also
  states the branch, target commit, and that uncommitted changes are discarded.
  Push lets the user choose a remote when several are configured.
- After an action, the graph, branches, tags, status, and remotes refresh. On
  failure the Git error is shown and the status refreshes too, so conflicts and
  in-progress operations are visible immediately.
- When a cherry-pick or revert stops on a conflict, the panel offers **Continue**
  and **Abort**. Continue finishes the operation once every conflict is resolved
  and staged; Abort is destructive and discards the partial result. Merge and
  rebase recovery are not offered because the panel never starts those
  operations.
- The changed-files header toggles between **Per-file view** and **Full patch**.
  Full patch shows every file of the commit in one diff; clicking a file returns
  to that file's view. Patches are capped at 256 KiB and marked truncated beyond
  that.
- The panel is a regular closable side tab. Open it from the side panel `+` menu
  or the command palette; closing it removes it from the strip, and it can be
  restored from the host's recently-closed list.

History inspection is read-only. Write actions run only after an explicit user
request, never in the background. Checkout warns first when the working tree is
dirty and never forces over local changes. Fetch and pull update remote-tracking
refs and the current branch; push updates the selected remote. None of them
prunes refs.

## Documentation

- [Initial request](./docs/initial-request.md) — the original brief, kept
  verbatim in French.
- [Changelog](./docs/changelog.md) — phase-by-phase record of the work and the
  remaining scope.
- [Agent rules](./AGENTS.md) — mandatory changelog update and push policy.

## OpenCode V2 APIs used

| Purpose | API |
| --- | --- |
| Server plugin definition | `Plugin.define` from `@opencode/plugin` |
| GUI plugin definition | `Plugin.define` from `@opencode/plugin/gui` |
| Side panel | `Panel` registry + `PanelTab` type |
| Open the panel | `MenuItem` (`session.panel`) and `Command` |
| Read the session | `ctx.sessions.current()` |
| Open / close a tab | `ctx.layout.open()` / `ctx.layout.state()`, `Panel.list({ open })`, `PanelTab.closable`, `Panel.closed` |
| Component context | `usePlugin()` |
| Native components | `ctx.ui.Icon`, `ctx.ui.Button` |
| Translations | `ctx.t()` + `i18n` in `Plugin.define` |
| Typed RPC | `Rpc.define`, `ctx.rpc.register`, `ctx.client.rpc()` |
| Portable RPC schemas | `Schema.toStandardSchemaV1` from `effect` |
| GUI bundle | `gui()` preset from `@opencode/plugin/gui/vite` |
| History / branches | Git CLI via `node:child_process.spawn`, with the shell disabled |
| Tags / HEAD | `git for-each-ref refs/tags` and `git rev-parse HEAD` through typed RPC |
| Search / branch filter | `git log --grep` and a validated local or remote ref |
| Fetch all remotes | `git fetch --all` through typed `fetchAll` RPC, only on button click |
| Working tree status | `git status --porcelain=v1 -z` through the `status` RPC |
| Remotes | `git remote` through the `remotes` RPC |
| Checkout | `git checkout <branch>` or `git checkout --detach <hash>` through typed RPC |
| Cherry-pick / revert | `git cherry-pick <hash>` and `git revert --no-edit <hash>` |
| Conflict recovery | `git cherry-pick\|revert --abort` and `--continue --no-edit` through typed RPC |
| Reset | `git reset --soft`, `--mixed`, or `--hard` with a validated mode |
| Push / pull | `git push <remote> refs/heads/<branch>:refs/heads/<branch>` and `git pull --ff-only` |
| Action confirmations | `ctx.dialogs.confirm`, `ctx.dialogs.select`, and `ctx.dialogs.alert` |
| Actions menu | `ctx.ui.Menu` with `UiMenuEntry` items |
| Commit files | `git diff-tree` name-status and numstat against the first parent, with rename detection |
| Commit patch | `git diff` against the first parent, or `git show --format=` for a root commit |
| File diff | `git diff` against the first parent, or `git show` for root commits, rendered as a syntax-highlighted unified patch |
| Graph | Pure lane-layout algorithm in `src/graph/layout.ts`, rendered as SVG |

## Verified versions

- OpenCode Desktop: `2.2.5`
- OpenCode CLI: `2.2.5`
- `@opencode/plugin`: `2.2.5` (exports `@opencode/plugin/gui`)
- `effect`: `4.0.6`
- `solid-js`: `1.9.18`
- `vite`: `7.3.7`
- `vite-plugin-solid`: `2.11.15`
- `typescript`: `5.9.3`
- `vitest`: `4.1.12`
- `eslint`: `10.14.0`

## Loading mechanism

The package exposes three entry points:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./rpc": "./src/rpc.ts",
    "./gui-experimental": "./dist/gui-experimental.cjs"
  }
}
```

- `.`: server plugin, loaded by the OpenCode server.
- `./rpc`: RPC contract, importable by clients.
- `./gui-experimental`: prebuilt CommonJS bundle, loaded by Desktop.

OpenCode Desktop loads GUI plugins from its background server, which reads the
global `opencode.json(c)` configuration. A local plugin entry must be a
**directory** containing a `package.json` with `name` and `exports`:

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["/Users/maximedeharbonnier/Projects/opencode-gitgui"]
}
```

The plugin id (`git-graph`) comes from the server plugin. The panel key is
therefore `git-graph:graph`.

## Development

```bash
npm install
npm run dev        # vite build --watch; rebuilds the GUI on changes
```

After changing the server plugin, reload the OpenCode configuration:

```bash
/Applications/OpenCode.app/Contents/Resources/opencode-cli reload
```

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
# or run everything:
npm run check
```

GitHub Actions runs `npm run check` on pushes to `main`, on pull requests that
target `main` and are opened, updated, or reopened, and on manual workflow
dispatch. Pushes to feature branches do not start a separate run: the same commit
is already checked once by its pull request. The workflow uses Node.js 22.12 and
`npm ci`; it covers typecheck, lint, tests, and the production build.

## Local installation

1. Build the GUI bundle:

   ```bash
   npm run build
   ```

2. Verify that OpenCode detects the plugin:

   ```bash
   /Applications/OpenCode.app/Contents/Resources/opencode-cli plugin list
   ```

3. Reload the OpenCode configuration, then open a session. Open the `Git Graph`
   tab from:
   - the side panel `+` menu;
   - the command palette (`Git Graph: Open panel`, `mod+shift+g`).

   The tab is closable and is restored with the session when it was left open.

## Known integration limitations

- The V2 GUI API (`gui-experimental`) is **experimental** and may change between
  OpenCode versions.
- Desktop reads GUI plugins only from `opencode.json(c)`; `cli.json` alone is
  not sufficient.
- If the server plugin fails to load, its GUI is unavailable.
- The `opencode` namespace and built-in plugin ids are reserved.
- Window `setup` is synchronous; asynchronous work belongs to a component,
  `createKeyed`, or `createLatest`.
- The tab is listed only while the session stores it open. If a session never
  opened it, use the side panel `+` menu or the command palette.

## Git command security and limits

- Git commands use `spawn("git", args)` with `shell: false`; paths are never
  interpolated into shell commands. Fetch arguments are fixed by the server and
  cannot be supplied by the GUI.
- The repository path must be absolute. Read commands have a 10-second timeout;
  user-requested fetch has a 120-second timeout. Captured stdout is limited to
  4 MiB.
- Each history request is capped at 300 commits and offset 10,000. The panel
  loads 300 commits initially and appends 100 per **Load more** request.
- Search queries are capped at 500 characters. The panel needs at least 2
  characters and waits 300 ms after the last keystroke before searching. Hash-like
  queries resolve through `git rev-parse`; otherwise they match commit messages
  with a fixed-string, case-insensitive `git log --grep`.
- Branch filters are validated against `refs/heads/<name>` and
  `refs/remotes/<name>` before being passed to Git; an unknown branch is
  rejected instead of being treated as a revision expression.
- Each commit file request returns at most 500 files; the RPC response includes
  a `truncated` flag when the commit has more.
- Each file diff and the whole-commit patch are capped at 256 KiB; the RPC
  response includes a `truncated` flag when the patch is larger.
- Diff highlighting uses a small built-in tokenizer, not a parser: it colors
  comments, strings, numbers, keywords, types, and function calls per line.
  Unknown file types, Markdown, and binary files stay uncolored, and a block
  comment that is still open when a new hunk starts is not carried into it.
- Merge commits are compared against their first parent, so the list shows what
  the merge brought in relative to the previous commit on the branch.
- Commits are read from all visible refs (`git log --all`), so remote branches
  must already have been fetched locally. Use **Fetch all** to update configured
  remotes.
- Fetch does not prune stale refs.
- Write actions accept only validated inputs: a local branch name that resolves
  to `refs/heads/<name>`, a full commit hash, a configured remote name, and one
  of the three reset modes. Revision expressions and option-like values are
  rejected before Git runs.
- Checkout never forces over local changes. Git refuses an overwrite and its
  error is shown; the panel warns first when the working tree is dirty.
- Cherry-pick and revert stop on conflict, leaving the operation in progress.
  The status RPC reports the conflict count and the in-progress operation
  instead of hiding the failure. The panel offers **Continue** (after conflicts
  are resolved and staged) and a destructive **Abort** for those two operations.
  Merge and rebase recovery are not exposed.
- Push and pull contact the network only after an explicit user request and use
  the same 120-second timeout as fetch. Pull is fast-forward only and fails on a
  diverged branch. Push never forces.
- Every write action confirms before running. Reset hard requires choosing the
  mode and then confirming a warning that uncommitted changes are discarded.
  Checkout of a commit confirms the detached HEAD state. These dialogs use the
  app's own confirmation and select components.
- Branch deletion, tag management, merge, rebase, stash, and remote
  configuration remain out of scope.
- An empty repository shows the empty state; the panel does not create an
  initial commit. A commit reachable only from a tag stays visible because
  history is read from every ref.

## Project structure

```text
docs/
├── initial-request.md # original brief, verbatim
└── changelog.md       # phase history and remaining scope
src/
├── index.ts          # server plugin: RPC registration
├── rpc.ts            # typed RPC contract (history, files, status, actions)
├── git/
│   ├── exec.ts       # safe Git runner and input validation
│   ├── reader.ts     # Git commands, history reading, and parsing
│   └── actions.ts    # status, checkout, cherry-pick, revert, reset, push, pull, recovery
├── graph/
│   ├── layout.ts     # graph lane and edge layout
│   └── render.ts     # SVG edge paths and merge arrow direction
├── gui.tsx           # GUI entry: Panel, MenuItem, Command
├── gui/
│   ├── branch-pill.tsx # shared branch reference badge
│   ├── tag-pill.tsx  # shared tag reference badge
│   ├── colors.ts     # lane palette and stable branch colors
│   ├── highlight.ts  # dependency-free diff syntax highlighting
│   └── panel.tsx     # SolidJS panel, search, pagination, and SVG graph
├── shared/
│   ├── branches.ts   # combine matching local and remote refs
│   └── ids.ts        # plugin and panel ids
└── tests/
    ├── branches.test.ts
    ├── colors.test.ts
    ├── git-actions.test.ts
    ├── git-reader.test.ts
    ├── graph-layout.test.ts
    ├── graph-render.test.ts
    ├── highlight.test.ts
    └── ids.test.ts
```
