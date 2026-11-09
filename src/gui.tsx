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
      "panel.actions": "Actions",
      "panel.checkout": "Checkout",
      "panel.checkoutBranchAction": "Checkout branch…",
      "panel.checkoutCommit": "Checkout commit",
      "panel.checkoutDescription": "Switch the working tree to this branch.",
      "panel.checkoutCommitDescription":
        "Check out this commit in detached HEAD state; new commits will not belong to a branch.",
      "panel.checkoutDirty":
        "The working tree has uncommitted changes. Checkout may fail or affect them; commit or stash them first.",
      "panel.noLocalBranches": "No other local branch to check out.",
      "panel.cherryPick": "Cherry-pick",
      "panel.cherryPickDescription": "Apply this commit on top of the current branch.",
      "panel.revert": "Revert",
      "panel.revertDescription": "Create a new commit that reverses this commit.",
      "panel.reset": "Reset",
      "panel.resetTitle": "Reset the current branch",
      "panel.resetSoft": "Soft",
      "panel.resetMixed": "Mixed",
      "panel.resetHard": "Hard",
      "panel.resetSoftDescription": "Move HEAD only; keep staged and working tree changes.",
      "panel.resetMixedDescription": "Move HEAD and unstage changes; keep the working tree.",
      "panel.resetHardDescription": "Move HEAD and discard staged and working tree changes.",
      "panel.resetHardWarning": "This discards all uncommitted changes and cannot be undone.",
      "panel.resetHardConfirm": "Reset hard",
      "panel.push": "Push",
      "panel.pull": "Pull",
      "panel.pushNeedsBranch": "Check out a branch before pushing.",
      "panel.pushNoRemotes": "No configured remote to push to.",
      "panel.pushSelectRemote": "Push to remote",
      "panel.pushDescription": "Send the current branch to the selected remote.",
      "panel.pullDescription":
        "Fast-forward the current branch from its upstream. Fails if the branch has diverged.",
      "panel.workingTreeClean": "Working tree clean",
      "panel.uncommittedChanges": "uncommitted changes",
      "panel.conflicts": "conflicts",
      "panel.inProgressMerge": "merge in progress",
      "panel.inProgressCherryPick": "cherry-pick in progress",
      "panel.inProgressRevert": "revert in progress",
      "panel.inProgressRebase": "rebase in progress",
      "panel.actionComplete": "Done",
      "panel.actionFailed": "Action failed",
      "command.open": "Git Graph: Open panel",
      "menu.open": "Git Graph",
    },
  },
  setup(ctx) {
    // The tab is opened from the side panel menu or the command palette and
    // can be closed again. `list` returns it only while the session stores it
    // open, so a closed tab leaves the strip instead of staying pinned.
    const tab: PanelTab = {
      id: PANEL_ID,
      get title() {
        return ctx.t("panel.title")
      },
      closable: "compact",
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
      list: ({ open }) => (open.includes(PANEL_ID) ? [tab] : []),
      render: (props) => <GitGraphPanel session={props.session} />,
      closed: () => ({ title: ctx.t("panel.title") }),
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
