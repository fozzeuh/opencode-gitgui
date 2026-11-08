import {
  Command,
  MenuItem,
  Panel,
  Plugin,
  type PanelTab,
} from "@opencode/plugin/gui"
import { GitGraphPanel } from "./gui/panel"
import { PANEL_ID, PANEL_KEY } from "./shared/ids"

export default Plugin.define({
  i18n: {
    en: {
      "panel.title": "Git Graph",
      "panel.repository": "Repository",
      "panel.refresh": "Refresh",
      "panel.fetchAll": "Fetch all",
      "panel.fetching": "Fetching all remotes…",
      "panel.fetchComplete": "Fetch complete; repository data refreshed.",
      "panel.fetchError": "Fetch failed",
      "panel.loading": "Loading Git history…",
      "panel.empty": "No commits found in this repository.",
      "panel.noResults": "No commits match the current search or branch filter.",
      "panel.search": "Search",
      "panel.searchPlaceholder": "Search a message or hash",
      "panel.searchMin": "Type at least 2 characters to search.",
      "panel.clearSearch": "Clear",
      "panel.searchResults": "Results for",
      "panel.branchFilter": "Branch",
      "panel.allBranches": "All branches",
      "panel.noSubject": "(no subject)",
      "panel.detached": "Detached HEAD",
      "panel.head": "HEAD",
      "panel.headTitle": "Currently checked out commit",
      "panel.tags": "Tags",
      "panel.branches": "branches",
      "panel.commitBy": "By",
      "panel.parents": "Parents:",
      "panel.merge": "merge",
      "panel.mergeCommit": "Merge commit",
      "panel.filesChanged": "Files changed",
      "panel.files": "files",
      "panel.loadingFiles": "Loading changed files…",
      "panel.noFiles": "No file changes recorded.",
      "panel.filesTruncated": "Showing the first 500 changed files.",
      "panel.viewDiff": "Click to view the diff",
      "panel.loadingDiff": "Loading diff…",
      "panel.noDiff": "No textual changes to display.",
      "panel.binaryDiff": "Binary file — no text diff available.",
      "panel.diffTruncated": "Diff truncated because it is too large.",
      "panel.closeDiff": "Close",
      "panel.binary": "Binary",
      "panel.containingBranches": "Current branches containing this commit",
      "panel.noContainingBranches": "No current branch contains this commit.",
      "panel.checkingBranches": "Checking branch membership…",
      "panel.loadMore": "Load more commits",
      "command.open": "Git Graph: Open panel",
      "menu.open": "Git Graph",
    },
  },
  setup(ctx) {
    // Pinned for phase 1 so the tab is visible as soon as a session is open.
    // It becomes a closable launcher in the GUI phase.
    const tab: PanelTab = {
      id: PANEL_ID,
      get title() {
        return ctx.t("panel.title")
      },
      pinned: true,
      closable: false,
      fallback: true,
    }

    ctx.add(Panel, {
      id: PANEL_ID,
      region: "side",
      mobile: {
        get title() {
          return ctx.t("panel.title")
        },
        order: 55,
        kind: "menu",
        icon: "branch",
      },
      list: () => [tab],
      render: (props) => <GitGraphPanel session={props.session} />,
    })

    ctx.add(MenuItem, (): MenuItem => {
      const session = ctx.sessions.current()

      return {
        menu: "session.panel",
        id: "open",
        title: ctx.t("menu.open"),
        icon: "branch",
        keybind: `${ctx.id}.open`,
        opened: session ? ctx.layout.state(PANEL_KEY, session) !== "closed" : false,
        run: () => {
          const current = ctx.sessions.current()
          if (current) ctx.layout.open(PANEL_KEY, current)
        },
      }
    })

    ctx.add(Command, (): Command => ({
      id: "open",
      title: ctx.t("command.open"),
      keywords: "git graph history commits branches",
      bind: "mod+shift+g",
      run: () => {
        const session = ctx.sessions.current()
        if (session) ctx.layout.open(PANEL_KEY, session)
      },
    }))
  },
})
