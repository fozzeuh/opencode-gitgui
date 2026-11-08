# OpenCode Git Graph

A native GUI plugin for **OpenCode Desktop V2**. It adds a `Git Graph` side
panel and a typed RPC bridge between the SolidJS GUI and the server plugin.

> OpenCode V2 only. OpenCode V1 is not supported.

## Status — Phase 3

Phase 1 validated plugin loading, opening the panel, and RPC transport. Phase 2
added repository reading and an interactive SVG graph. Phase 3 adds commit file
inspection:

- Multi-branch history, loaded in pages of 50 commits with a **Load more** button.
- Local and remote branch labels, combined when they have the same name and
  point to the same commit; the checked-out branch is indicated.
- Branches containing the selected commit, with colors linked to a stable
  per-branch palette rather than graph lanes.
- SVG commit graph whose nodes and line segments follow the branch color, so a
  feature branch stays visually distinct from `main` even on a linear history.
- Classic side-branch layout: a merged branch leaves the main line, runs beside
  it, and visibly rejoins at the fork point.
- Merge commits use an outer ring, dashed merge links, and an arrow into the
  merged branch.
- Branch tips are shown as colored pills directly on the commit rows.
- Select a commit to view its author, date, hash, parents, and the files it
  changed.
- Changed files show their status (added, modified, deleted, renamed, copied,
  type change), rename source, additions and deletions, and a binary marker.
- Click a changed file to open its unified diff against the first parent, with
  colored additions, deletions, and hunk headers.
- **Refresh** repository data manually, or click **Fetch all** to fetch from all
  configured remotes and then refresh the graph and branch list.

Git inspection is read-only. The explicit **Fetch all** action contacts configured
remotes and updates remote-tracking refs, but does not prune refs or change the
checked-out branch or working tree. No destructive Git commands are exposed.

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
| Open / inspect panel state | `ctx.layout.open()` / `ctx.layout.state()` |
| Component context | `usePlugin()` |
| Native components | `ctx.ui.Icon`, `ctx.ui.Button` |
| Translations | `ctx.t()` + `i18n` in `Plugin.define` |
| Typed RPC | `Rpc.define`, `ctx.rpc.register`, `ctx.client.rpc()` |
| Portable RPC schemas | `Schema.toStandardSchemaV1` from `effect` |
| GUI bundle | `gui()` preset from `@opencode/plugin/gui/vite` |
| History / branches | Git CLI via `node:child_process.spawn`, with the shell disabled |
| Fetch all remotes | `git fetch --all` through typed `fetchAll` RPC, only on button click |
| Commit files | `git diff-tree` name-status and numstat against the first parent, with rename detection |
| File diff | `git diff` against the first parent, or `git show` for root commits, rendered as a colored unified patch |
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

3. Reload the OpenCode configuration, then open a session. The `Git Graph` tab
   is pinned in the side panel. It is also available from:
   - the side panel `+` menu;
   - the command palette (`Git Graph: Open panel`, `mod+shift+g`).

## Known integration limitations

- The V2 GUI API (`gui-experimental`) is **experimental** and may change between
  OpenCode versions.
- Desktop reads GUI plugins only from `opencode.json(c)`; `cli.json` alone is
  not sufficient.
- If the server plugin fails to load, its GUI is unavailable.
- The `opencode` namespace and built-in plugin ids are reserved.
- Window `setup` is synchronous; asynchronous work belongs in a component,
  `createKeyed`, or `createLatest`.
- The tab remains `pinned` to ensure visibility during this phase. It is planned
  to become a closable tab opened from a launcher in a later GUI phase.

## Git command security and limits

- Git commands use `spawn("git", args)` with `shell: false`; paths are never
  interpolated into shell commands. Fetch arguments are fixed by the server and
  cannot be supplied by the GUI.
- The repository path must be absolute. Read commands have a 10-second timeout;
  user-requested fetch has a 120-second timeout. Captured stdout is limited to
  4 MiB.
- Each history request is capped at 100 commits and offset 10,000.
- Each commit file request returns at most 500 files; the RPC response includes
  a `truncated` flag when the commit has more.
- Each file diff is capped at 256 KiB; the RPC response includes a `truncated`
  flag when the patch is larger.
- Merge commits are compared against their first parent, so the list shows what
  the merge brought in relative to the previous commit on the branch.
- Commits are read from all visible refs (`git log --all`), so remote branches
  must already have been fetched locally. Use **Fetch all** to update configured
  remotes.
- Fetch does not prune stale refs. Checkout, reset, cherry-pick, push, pull, and
  deletion remain out of scope.

## Project structure

```text
docs/
├── initial-request.md # original brief, verbatim
└── changelog.md       # phase history and remaining scope
src/
├── index.ts          # server plugin: RPC registration
├── rpc.ts            # typed RPC contract (ping, history, branches)
├── git/
│   └── reader.ts     # Git commands, history reading, and parsing
├── graph/
│   └── layout.ts     # graph lane and edge layout
├── gui.tsx           # GUI entry: Panel, MenuItem, Command
├── gui/
│   ├── branch-pill.tsx # shared branch reference badge
│   ├── colors.ts     # lane palette and stable branch colors
│   └── panel.tsx     # SolidJS panel, pagination, and SVG graph
├── shared/
│   ├── branches.ts   # combine matching local and remote refs
│   └── ids.ts        # plugin and panel ids
└── tests/
    ├── branches.test.ts
    ├── colors.test.ts
    ├── git-reader.test.ts
    ├── graph-layout.test.ts
    └── ids.test.ts
```
