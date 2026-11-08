import type { MountedSession } from "@opencode/plugin/gui"
import { usePlugin } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type { GitBranch, GitCommit, GitFileChange, GitFileStatus, GitTag } from "../git/reader"
import { layoutGraph } from "../graph/layout"
import { edgePath } from "../graph/render"
import { GitGraphRpc } from "../rpc"
import { combineBranchRefs, countLogicalBranches, type BranchLabel } from "../shared/branches"
import { BranchPill } from "./branch-pill"
import { TagPill } from "./tag-pill"
import {
  assignGraphColors,
  branchColorMap,
  colorIndex,
  edgeColorKey,
  fallbackBranchColor,
  GRAPH_COLORS,
  laneColor,
} from "./colors"

const INITIAL_PAGE_SIZE = 300
const PAGE_SIZE = 100
const ROW_HEIGHT = 50
const LANE_WIDTH = 14
const FILE_STATUS_LABELS: Record<GitFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  "type-changed": "T",
  unknown: "?",
}
const FILE_STATUS_COLORS: Record<GitFileStatus, string> = {
  added: "#42be65",
  modified: "#78a9ff",
  deleted: "#da1e28",
  renamed: "#be95ff",
  copied: "#33b1ff",
  "type-changed": "#f1c21b",
  unknown: "#8d8d8d",
}

export function GitGraphPanel(props: { readonly session: MountedSession }) {
  const ctx = usePlugin()
  const [root, setRoot] = createSignal("")
  const [commits, setCommits] = createSignal<GitCommit[]>([])
  const [branches, setBranches] = createSignal<GitBranch[]>([])
  const [tags, setTags] = createSignal<GitTag[]>([])
  const [containingBranches, setContainingBranches] = createSignal<GitBranch[]>([])
  const [currentBranch, setCurrentBranch] = createSignal<string | null>(null)
  const [headHash, setHeadHash] = createSignal<string | null>(null)
  const [searchInput, setSearchInput] = createSignal("")
  const [appliedQuery, setAppliedQuery] = createSignal("")
  const [branchFilter, setBranchFilter] = createSignal<string | null>(null)
  const [selected, setSelected] = createSignal<string | null>(null)
  const [offset, setOffset] = createSignal(0)
  const [hasMore, setHasMore] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const [fetching, setFetching] = createSignal(false)
  const [fetchMessage, setFetchMessage] = createSignal("")
  const [fetchError, setFetchError] = createSignal("")
  const [loadingMore, setLoadingMore] = createSignal(false)
  const [loadingContainingBranches, setLoadingContainingBranches] = createSignal(false)
  const [containingBranchesError, setContainingBranchesError] = createSignal("")
  const [files, setFiles] = createSignal<GitFileChange[]>([])
  const [filesTruncated, setFilesTruncated] = createSignal(false)
  const [loadingFiles, setLoadingFiles] = createSignal(false)
  const [filesError, setFilesError] = createSignal("")
  const [selectedFile, setSelectedFile] = createSignal<string | null>(null)
  const [diff, setDiff] = createSignal("")
  const [diffBinary, setDiffBinary] = createSignal(false)
  const [diffTruncated, setDiffTruncated] = createSignal(false)
  const [loadingDiff, setLoadingDiff] = createSignal(false)
  const [diffError, setDiffError] = createSignal("")
  const [detailHeight, setDetailHeight] = createSignal(0)
  const [error, setError] = createSignal("")
  let generation = 0
  let branchRequest = 0
  let filesRequest = 0
  let diffRequest = 0
  let detailObserver: ResizeObserver | undefined

  const graph = createMemo(() => layoutGraph(commits()))
  const laneCount = createMemo(() => Math.max(1, ...graph().map((row) => row.lane + 1)))
  const graphWidth = createMemo(() => 16 + laneCount() * LANE_WIDTH)
  const branchLabels = createMemo(() => combineBranchRefs(branches()))
  const containingBranchLabels = createMemo(() => combineBranchRefs(containingBranches()))
  const branchColors = createMemo(() => branchColorMap(branchLabels().map((branch) => branch.name)))
  const branchesByHash = createMemo(() => {
    const groups = new Map<string, BranchLabel[]>()
    for (const branch of branchLabels()) {
      const list = groups.get(branch.hash)
      if (list) list.push(branch)
      else groups.set(branch.hash, [branch])
    }
    return groups
  })
  const tagsByHash = createMemo(() => {
    const groups = new Map<string, GitTag[]>()
    for (const tag of tags()) {
      const list = groups.get(tag.hash)
      if (list) list.push(tag)
      else groups.set(tag.hash, [tag])
    }
    return groups
  })
  const branchCount = createMemo(() => countLogicalBranches(branches()))
  const branchFilterItems = createMemo(() => [
    {
      label: ctx.t("panel.allBranches"),
      onSelect: () => chooseBranch(null),
    },
    ...branchLabels().map((branch) => ({
      label: branch.name,
      onSelect: () => chooseBranch(branch.name),
    })),
  ])
  const indexByHash = createMemo(() => new Map(commits().map((commit, index) => [commit.hash, index])))
  const selectedCommit = createMemo(() => commits().find((commit) => commit.hash === selected()))
  const selectedIndex = createMemo(() => commits().findIndex((commit) => commit.hash === selected()))
  const rowTop = (index: number) => index * ROW_HEIGHT + (selectedIndex() >= 0 && selectedIndex() < index ? detailHeight() : 0)
  const colorForBranch = (branch: BranchLabel) =>
    branchColors().get(branch.name) ?? fallbackBranchColor(branch.name)
  const branchColorByHash = createMemo(() => {
    const colors = new Map<string, string>()
    for (const branch of branchLabels()) {
      if (!colors.has(branch.hash)) colors.set(branch.hash, colorForBranch(branch))
    }
    return colors
  })
  const graphColors = createMemo(() =>
    assignGraphColors(graph(), branchColorByHash(), laneColor),
  )
  const fileStats = createMemo(() => {
    let additions = 0
    let deletions = 0
    for (const file of files()) {
      additions += file.additions ?? 0
      deletions += file.deletions ?? 0
    }
    return { additions, deletions }
  })
  const selectedFileChange = createMemo(
    () => files().find((file) => file.path === selectedFile()) ?? null,
  )
  const diffLines = createMemo(() => diff().replace(/\n$/, "").split("\n"))

  function observeDetail(element: HTMLElement) {
    detailObserver?.disconnect()
    setDetailHeight(element.getBoundingClientRect().height)
    detailObserver = new ResizeObserver(() => setDetailHeight(element.getBoundingClientRect().height))
    detailObserver.observe(element)
  }

  onCleanup(() => detailObserver?.disconnect())

  async function refresh(directory: string) {
    const request = ++generation
    setLoading(true)
    setLoadingMore(false)
    setError("")
    setSelected(null)
    try {
      const client = ctx.client.rpc(GitGraphRpc)
      const query = appliedQuery()
      const branch = branchFilter()
      const [history, branchInfo, tagInfo] = await Promise.all([
        client.history({ directory, limit: INITIAL_PAGE_SIZE, offset: 0, query, branch }),
        client.branches({ directory }),
        client.tags({ directory }),
      ])
      if (request !== generation) return
      setRoot(history.root)
      setCommits([...history.commits])
      setBranches([...branchInfo.branches])
      setCurrentBranch(branchInfo.current)
      setHeadHash(branchInfo.head)
      setTags([...tagInfo.tags])
      setOffset(history.commits.length)
      setHasMore(history.commits.length === INITIAL_PAGE_SIZE)
    } catch (cause) {
      if (request === generation) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (request === generation) setLoading(false)
    }
  }

  async function fetchAll() {
    if (fetching()) return
    const directory = props.session.directory
    setFetching(true)
    setFetchMessage("")
    setFetchError("")
    try {
      await ctx.client.rpc(GitGraphRpc).fetchAll({ directory })
      setFetchMessage(ctx.t("panel.fetchComplete"))
      await refresh(directory)
    } catch (cause) {
      setFetchError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setFetching(false)
    }
  }

  async function loadMore() {
    if (loadingMore() || !hasMore()) return
    const request = generation
    const directory = props.session.directory
    setLoadingMore(true)
    setError("")
    try {
      const page = await ctx.client.rpc(GitGraphRpc).history({
        directory,
        limit: PAGE_SIZE,
        offset: offset(),
        query: appliedQuery(),
        branch: branchFilter(),
      })
      if (request !== generation) return
      setCommits((current) => {
        const known = new Set(current.map((commit) => commit.hash))
        return [...current, ...page.commits.filter((commit) => !known.has(commit.hash))]
      })
      setOffset((current) => current + page.commits.length)
      setHasMore(page.commits.length === PAGE_SIZE)
    } catch (cause) {
      if (request === generation) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (request === generation) setLoadingMore(false)
    }
  }

  function submitSearch() {
    const next = searchInput().trim()
    if (next === appliedQuery()) void refresh(props.session.directory)
    else setAppliedQuery(next)
  }

  function clearSearch() {
    setSearchInput("")
    if (appliedQuery() === "") void refresh(props.session.directory)
    else setAppliedQuery("")
  }

  function chooseBranch(name: string | null) {
    if (name === branchFilter()) void refresh(props.session.directory)
    else setBranchFilter(name)
  }

  createEffect(() => {
    const directory = props.session.directory
    appliedQuery()
    branchFilter()
    void refresh(directory)
  })

  createEffect(() => {
    const commit = selectedCommit()
    const directory = props.session.directory
    const request = ++branchRequest

    setContainingBranches([])
    setContainingBranchesError("")
    setLoadingContainingBranches(!!commit)
    if (!commit) return

    void ctx.client.rpc(GitGraphRpc)
      .branchesContaining({ directory, hash: commit.hash })
      .then((result) => {
        if (request === branchRequest) setContainingBranches([...result.branches])
      })
      .catch((cause: unknown) => {
        if (request === branchRequest) {
          setContainingBranchesError(cause instanceof Error ? cause.message : String(cause))
        }
      })
      .finally(() => {
        if (request === branchRequest) setLoadingContainingBranches(false)
      })
  })

  createEffect(() => {
    const commit = selectedCommit()
    const directory = props.session.directory
    const request = ++filesRequest

    setFiles([])
    setFilesTruncated(false)
    setFilesError("")
    setSelectedFile(null)
    setLoadingFiles(!!commit)
    if (!commit) return

    void ctx.client.rpc(GitGraphRpc)
      .commitFiles({ directory, hash: commit.hash })
      .then((result) => {
        if (request !== filesRequest) return
        setFiles([...result.files])
        setFilesTruncated(result.truncated)
      })
      .catch((cause: unknown) => {
        if (request === filesRequest) {
          setFilesError(cause instanceof Error ? cause.message : String(cause))
        }
      })
      .finally(() => {
        if (request === filesRequest) setLoadingFiles(false)
      })
  })

  createEffect(() => {
    const commit = selectedCommit()
    const file = selectedFileChange()
    const directory = props.session.directory
    const request = ++diffRequest

    setDiff("")
    setDiffBinary(false)
    setDiffTruncated(false)
    setDiffError("")
    if (!commit || !file) {
      setLoadingDiff(false)
      return
    }
    if (file.binary) {
      setDiffBinary(true)
      setLoadingDiff(false)
      return
    }

    setLoadingDiff(true)
    void ctx.client.rpc(GitGraphRpc)
      .commitFileDiff({
        directory,
        hash: commit.hash,
        path: file.path,
        previousPath: file.previousPath,
      })
      .then((result) => {
        if (request !== diffRequest) return
        setDiff(result.patch)
        setDiffBinary(result.binary)
        setDiffTruncated(result.truncated)
      })
      .catch((cause: unknown) => {
        if (request === diffRequest) {
          setDiffError(cause instanceof Error ? cause.message : String(cause))
        }
      })
      .finally(() => {
        if (request === diffRequest) setLoadingDiff(false)
      })
  })

  const shortHash = (hash: string) => hash.slice(0, 7)
  const commitDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleString()

  function activateCommit(commit: GitCommit) {
    setSelected((current) => (current === commit.hash ? null : commit.hash))
  }

  function activateFile(file: GitFileChange) {
    setSelectedFile((current) => (current === file.path ? null : file.path))
  }

  function onFileKeyDown(event: KeyboardEvent, file: GitFileChange) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      activateFile(file)
    }
  }

  function diffLineStyle(line: string) {
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("copy from") ||
      line.startsWith("copy to") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ")
    ) {
      return { opacity: 0.6 }
    }
    if (line.startsWith("@@")) {
      return { color: "#78a9ff", "background-color": "rgba(120, 169, 255, 0.10)" }
    }
    if (line.startsWith("+")) {
      return { color: "#42be65", "background-color": "rgba(66, 190, 101, 0.10)" }
    }
    if (line.startsWith("-")) {
      return { color: "#da1e28", "background-color": "rgba(218, 30, 40, 0.10)" }
    }
    return {}
  }

  function onCommitKeyDown(event: KeyboardEvent, commit: GitCommit) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      activateCommit(commit)
    }
  }

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "12px",
        height: "100%",
        padding: "12px",
        overflow: "auto",
      }}
    >
      <header style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        <ctx.ui.Icon name="branch" />
        <strong style={{ "font-size": "13px", "font-weight": 600, flex: 1 }}>{ctx.t("panel.title")}</strong>
        <ctx.ui.Button icon="refresh" size="small" busy={loading()} onClick={() => void refresh(props.session.directory)}>
          {ctx.t("panel.refresh")}
        </ctx.ui.Button>
        <ctx.ui.Button size="small" busy={fetching()} onClick={() => void fetchAll()}>
          {ctx.t("panel.fetchAll")}
        </ctx.ui.Button>
      </header>

      <section style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
        <div style={{ display: "flex", gap: "6px", "align-items": "center" }}>
          <div style={{ flex: 1, "min-width": 0 }}>
            <ctx.ui.TextInput
              type="search"
              label={ctx.t("panel.search")}
              placeholder={ctx.t("panel.searchPlaceholder")}
              value={searchInput()}
              onInput={setSearchInput}
              onSubmit={submitSearch}
            />
          </div>
          <ctx.ui.Button size="small" onClick={submitSearch}>
            {ctx.t("panel.search")}
          </ctx.ui.Button>
          <Show when={appliedQuery()}>
            <ctx.ui.Button size="small" onClick={clearSearch}>
              {ctx.t("panel.clearSearch")}
            </ctx.ui.Button>
          </Show>
        </div>
        <div style={{ display: "flex", gap: "6px", "align-items": "center", "font-size": "11px" }}>
          <ctx.ui.Menu
            trigger="button"
            icon="branch"
            label={`${ctx.t("panel.branchFilter")}: ${branchFilter() ?? ctx.t("panel.allBranches")}`}
            items={branchFilterItems()}
          />
          <Show when={appliedQuery()}>
            <span style={{ opacity: 0.65 }}>
              {ctx.t("panel.searchResults")}: “{appliedQuery()}”
            </span>
          </Show>
        </div>
      </section>

      <Show when={fetchError()}>
        <div role="alert" style={{ "font-size": "11px", "line-height": 1.5, color: "#da1e28" }}>
          {ctx.t("panel.fetchError")}: {fetchError()}
        </div>
      </Show>
      <Show when={fetching()}>
        <div role="status" style={{ "font-size": "11px", "line-height": 1.5, opacity: 0.7 }}>
          {ctx.t("panel.fetching")}
        </div>
      </Show>
      <Show when={fetchMessage() && !fetching()}>
        <div role="status" style={{ "font-size": "11px", "line-height": 1.5, color: "#42be65" }}>
          {fetchMessage()}
        </div>
      </Show>

      <section style={{ display: "flex", "flex-direction": "column", gap: "5px" }}>
        <span style={{ "font-size": "11px", opacity: 0.65 }}>{ctx.t("panel.repository")}</span>
        <code
          title={root() || props.session.directory}
          style={{
            display: "block",
            "font-family": "inherit",
            "font-size": "11px",
            "line-height": 1.5,
            opacity: 0.85,
            "word-break": "break-all",
          }}
        >
          {root() || props.session.directory}
        </code>
      </section>

      <Show when={currentBranch() || branches().length > 0}>
        <section style={{ display: "flex", "flex-direction": "column", gap: "6px" }}>
          <div style={{ display: "flex", "align-items": "center", gap: "6px", "font-size": "11px" }}>
            <ctx.ui.Icon name="branch" size="small" />
            <span>
              {currentBranch() ||
                (headHash() ? `${ctx.t("panel.detached")} · ${shortHash(headHash() ?? "")}` : ctx.t("panel.detached"))}
            </span>
            <span style={{ opacity: 0.6 }}>· {branchCount()} {ctx.t("panel.branches")}</span>
          </div>
          <div style={{ display: "flex", gap: "5px", "flex-wrap": "wrap" }}>
            <For each={branchLabels().slice(0, 8)}>
              {(branch) => (
                <BranchPill
                  name={branch.name}
                  remotes={branch.remotes}
                  hash={branch.hash}
                  color={colorForBranch(branch)}
                  current={branch.current}
                  muted={!branch.current}
                />
              )}
            </For>
            <Show when={branchLabels().length > 8}>
              <span style={{ "font-size": "10px", opacity: 0.6 }}>+{branchLabels().length - 8}</span>
            </Show>
          </div>
        </section>
      </Show>

      <Show when={error()}>
        <div role="alert" style={{ "font-size": "11px", "line-height": 1.5, color: "#da1e28" }}>
          <ctx.ui.Icon name="circle-exclamation" size="small" /> {error()}
        </div>
      </Show>

      <Show when={!loading()} fallback={<span style={{ "font-size": "12px", opacity: 0.65 }}>{ctx.t("panel.loading")}</span>}>
        <Show
          when={commits().length > 0}
          fallback={
            <span style={{ "font-size": "12px", opacity: 0.65 }}>
              {appliedQuery() || branchFilter() ? ctx.t("panel.noResults") : ctx.t("panel.empty")}
            </span>
          }
        >
          <div style={{ display: "grid", "grid-template-columns": `${graphWidth()}px minmax(0, 1fr)`, "align-items": "start" }}>
            <svg
              width={graphWidth()}
              height={commits().length * ROW_HEIGHT + (selectedCommit() ? detailHeight() : 0)}
              viewBox={`0 0 ${graphWidth()} ${commits().length * ROW_HEIGHT + (selectedCommit() ? detailHeight() : 0)}`}
              aria-hidden="true"
              style={{ overflow: "visible" }}
            >
              <defs>
                <For each={GRAPH_COLORS}>
                  {(color, colorIndex) => (
                    <marker
                      id={`git-graph-merge-${colorIndex()}`}
                      viewBox="0 0 7 7"
                      refX="7"
                      refY="3.5"
                      markerWidth="7"
                      markerHeight="7"
                      markerUnits="userSpaceOnUse"
                      orient="auto"
                    >
                      <path d="M 0 0 L 7 3.5 L 0 7 Z" fill={color} />
                    </marker>
                  )}
                </For>
              </defs>
              <For each={graph()}>
                {(row, index) => {
                  const y = rowTop(index()) + ROW_HEIGHT / 2
                  const x = 8 + row.lane * LANE_WIDTH
                  return (
                    <>
                      <For each={row.edges}>
                        {(edge) => {
                          const parentIndex = indexByHash().get(edge.parent)
                          if (parentIndex === undefined) return null
                          const parentY = rowTop(parentIndex) + ROW_HEIGHT / 2
                          const parentX = 8 + edge.toLane * LANE_WIDTH
                          const color =
                            graphColors().edges.get(edgeColorKey(row.hash, edge.parent)) ??
                            laneColor(edge.merge ? edge.toLane : edge.fromLane)
                          // Merge edges stop just below the merge node so their arrow
                          // points up into it; regular edges run down to the parent.
                          const path = edgePath(
                            { fromX: x, fromY: y, toX: parentX, toY: parentY },
                            edge.merge,
                          )
                          return (
                            <path
                              d={path}
                              fill="none"
                              stroke={color}
                              stroke-width={edge.merge ? 1.75 : 2}
                              stroke-dasharray={edge.merge ? "5 3" : undefined}
                              marker-end={
                                edge.merge ? `url(#git-graph-merge-${colorIndex(color)})` : undefined
                              }
                            />
                          )
                        }}
                      </For>
                      <circle
                        cx={x}
                        cy={y}
                        r={4}
                        fill={graphColors().rows.get(row.hash) ?? laneColor(row.lane)}
                        stroke="currentColor"
                        stroke-width="1"
                      />
                      <Show when={row.merge}>
                        <circle
                          cx={x}
                          cy={y}
                          r={7.5}
                          fill="none"
                          stroke={graphColors().rows.get(row.hash) ?? laneColor(row.lane)}
                          stroke-width="1.5"
                          opacity="0.85"
                        >
                          <title>{ctx.t("panel.mergeCommit")}</title>
                        </circle>
                      </Show>
                    </>
                  )
                }}
              </For>
            </svg>

            <div>
              <For each={commits()}>
                {(commit) => {
                  const active = () => selected() === commit.hash
                  return (
                    <>
                      <div
                        role="button"
                        tabindex="0"
                        aria-pressed={active()}
                        onClick={() => activateCommit(commit)}
                        onKeyDown={(event) => onCommitKeyDown(event, commit)}
                        style={{
                          display: "flex",
                          "flex-direction": "column",
                          "justify-content": "center",
                          gap: "3px",
                          height: `${ROW_HEIGHT}px`,
                          padding: "0 6px",
                          overflow: "hidden",
                          cursor: "pointer",
                          "border-radius": "4px",
                          background: active() ? "rgba(120, 169, 255, 0.14)" : "transparent",
                        }}
                      >
                        <span
                          title={commit.subject}
                          style={{ "font-size": "11px", "font-weight": 550, "text-overflow": "ellipsis", "white-space": "nowrap", overflow: "hidden" }}
                        >
                          {commit.subject || ctx.t("panel.noSubject")}
                        </span>
                        <span style={{ display: "flex", "align-items": "center", gap: "5px", "font-size": "10px", "white-space": "nowrap", overflow: "hidden" }}>
                          <code style={{ opacity: 0.62 }}>{shortHash(commit.hash)}</code>
                          <Show when={commit.hash === headHash()}>
                            <span
                              title={ctx.t("panel.headTitle")}
                              style={{
                                padding: "0 4px",
                                "border-radius": "3px",
                                "background-color": "rgba(120, 169, 255, 0.20)",
                                "font-size": "9px",
                                "font-weight": 600,
                                "line-height": "14px",
                                color: "#78a9ff",
                              }}
                            >
                              {ctx.t("panel.head")}
                            </span>
                          </Show>
                          <Show when={commit.parents.length > 1}>
                            <span
                              title={ctx.t("panel.mergeCommit")}
                              style={{
                                padding: "0 4px",
                                "border-radius": "3px",
                                "background-color": "rgba(127, 127, 127, 0.20)",
                                "font-size": "9px",
                                "line-height": "14px",
                                opacity: 0.8,
                              }}
                            >
                              {ctx.t("panel.merge")}
                            </span>
                          </Show>
                          <span style={{ opacity: 0.62, "text-overflow": "ellipsis", overflow: "hidden" }}>{commit.author}</span>
                          <For each={branchesByHash().get(commit.hash) ?? []}>
                            {(branch) => (
                              <BranchPill
                                name={branch.name}
                                remotes={branch.remotes}
                                color={colorForBranch(branch)}
                                current={branch.current}
                                compact
                              />
                            )}
                          </For>
                          <For each={tagsByHash().get(commit.hash) ?? []}>
                            {(tag) => <TagPill name={tag.name} hash={tag.hash} compact />}
                          </For>
                          <Show
                            when={
                              (branchesByHash().get(commit.hash) ?? []).length === 0 &&
                              (tagsByHash().get(commit.hash) ?? []).length === 0 &&
                              commit.decorations
                            }
                          >
                            <span title={commit.decorations} style={{ opacity: 0.72 }}>{commit.decorations}</span>
                          </Show>
                        </span>
                      </div>

                      <Show when={active()}>
                        <section
                          ref={observeDetail}
                          style={{
                            display: "flex",
                            "flex-direction": "column",
                            "justify-content": "center",
                            gap: "7px",
                            "box-sizing": "border-box",
                            padding: "12px",
                            "border-radius": "5px",
                            "background-color": "rgba(127, 127, 127, 0.10)",
                            "font-size": "13px",
                            "line-height": 1.4,
                          }}
                        >
                          <strong style={{ "font-size": "14px", "line-height": 1.4 }}>{commit.subject}</strong>
                          <span style={{ "overflow-wrap": "anywhere" }}>
                            {ctx.t("panel.commitBy")} {commit.author} · {commitDate(commit.timestamp)}
                          </span>
                          <code style={{ "word-break": "break-all", opacity: 0.8 }}>{commit.hash}</code>
                          <Show when={commit.hash === headHash()}>
                            <span style={{ color: "#78a9ff" }}>{ctx.t("panel.headTitle")}</span>
                          </Show>
                          <Show when={commit.parents.length > 0}>
                            <span style={{ "overflow-wrap": "anywhere" }}>
                              {ctx.t("panel.parents")} {commit.parents.map(shortHash).join(", ")}
                            </span>
                          </Show>
                          <Show when={(tagsByHash().get(commit.hash) ?? []).length > 0}>
                            <span style={{ display: "flex", "align-items": "center", gap: "5px", "flex-wrap": "wrap" }}>
                              <strong>{ctx.t("panel.tags")}</strong>
                              <For each={tagsByHash().get(commit.hash) ?? []}>
                                {(tag) => <TagPill name={tag.name} hash={tag.hash} />}
                              </For>
                            </span>
                          </Show>
                          <div style={{ display: "flex", "flex-direction": "column", gap: "6px", "margin-top": "2px" }}>
                            <div style={{ display: "flex", "align-items": "baseline", "flex-wrap": "wrap", gap: "6px" }}>
                              <strong>{ctx.t("panel.filesChanged")}</strong>
                              <Show when={!loadingFiles() && !filesError() && files().length > 0}>
                                <span style={{ "font-size": "11px", opacity: 0.7 }}>
                                  {filesTruncated() ? `${files().length}+` : files().length} {ctx.t("panel.files")} ·{" "}
                                  <span style={{ color: "#42be65" }}>+{fileStats().additions}</span>{" "}
                                  <span style={{ color: "#da1e28" }}>−{fileStats().deletions}</span>
                                </span>
                              </Show>
                            </div>
                            <Show
                              when={!loadingFiles()}
                              fallback={<span style={{ opacity: 0.65 }}>{ctx.t("panel.loadingFiles")}</span>}
                            >
                              <Show
                                when={!filesError()}
                                fallback={<span role="alert" style={{ color: "#da1e28" }}>{filesError()}</span>}
                              >
                                <Show
                                  when={files().length > 0}
                                  fallback={<span style={{ opacity: 0.65 }}>{ctx.t("panel.noFiles")}</span>}
                                >
                                  <div style={{ display: "flex", "flex-direction": "column", gap: "3px", "max-height": "240px", overflow: "auto" }}>
                                    <For each={files()}>
                                      {(file) => (
                                        <div
                                          role="button"
                                          tabindex="0"
                                          aria-pressed={selectedFile() === file.path}
                                          title={`${file.previousPath ? `${file.previousPath} → ${file.path}` : file.path} · ${ctx.t("panel.viewDiff")}`}
                                          onClick={() => activateFile(file)}
                                          onKeyDown={(event) => onFileKeyDown(event, file)}
                                          style={{
                                            display: "grid",
                                            "grid-template-columns": "10px 16px minmax(0, 1fr) auto",
                                            "align-items": "center",
                                            gap: "6px",
                                            padding: "2px 4px",
                                            "border-radius": "3px",
                                            cursor: "pointer",
                                            "background-color":
                                              selectedFile() === file.path
                                                ? "rgba(120, 169, 255, 0.18)"
                                                : "rgba(127, 127, 127, 0.08)",
                                            outline:
                                              selectedFile() === file.path
                                                ? "1px solid rgba(120, 169, 255, 0.55)"
                                                : "none",
                                            "font-size": "11px",
                                          }}
                                        >
                                          <span aria-hidden="true" style={{ "font-size": "9px", opacity: 0.65 }}>
                                            {selectedFile() === file.path ? "▾" : "▸"}
                                          </span>
                                          <span
                                            aria-label={file.status}
                                            title={file.status}
                                            style={{
                                              display: "inline-flex",
                                              "align-items": "center",
                                              "justify-content": "center",
                                              width: "14px",
                                              height: "14px",
                                              "border-radius": "3px",
                                              "font-size": "9px",
                                              "font-weight": 700,
                                              color: "#ffffff",
                                              background: FILE_STATUS_COLORS[file.status],
                                            }}
                                          >
                                            {FILE_STATUS_LABELS[file.status]}
                                          </span>
                                          <code
                                            style={{
                                              "font-family": "inherit",
                                              "text-overflow": "ellipsis",
                                              "white-space": "nowrap",
                                              overflow: "hidden",
                                            }}
                                          >
                                            {file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}
                                          </code>
                                          <span style={{ display: "inline-flex", gap: "5px", "font-variant-numeric": "tabular-nums" }}>
                                            <Show
                                              when={file.binary}
                                              fallback={
                                                <>
                                                  <span style={{ color: "#42be65" }}>+{file.additions ?? 0}</span>
                                                  <span style={{ color: "#da1e28" }}>−{file.deletions ?? 0}</span>
                                                </>
                                              }
                                            >
                                              <span style={{ opacity: 0.65 }}>{ctx.t("panel.binary")}</span>
                                            </Show>
                                          </span>
                                        </div>
                                      )}
                                    </For>
                                  </div>
                                  <Show when={filesTruncated()}>
                                    <span style={{ "font-size": "10px", opacity: 0.65 }}>{ctx.t("panel.filesTruncated")}</span>
                                  </Show>
                                </Show>
                              </Show>
                            </Show>
                            <Show when={selectedFileChange()}>
                              {(file) => (
                                <div
                                  style={{
                                    display: "flex",
                                    "flex-direction": "column",
                                    "border-radius": "4px",
                                    border: "1px solid rgba(127, 127, 127, 0.25)",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      "align-items": "center",
                                      gap: "6px",
                                      padding: "4px 6px",
                                      "background-color": "rgba(127, 127, 127, 0.12)",
                                      "font-size": "11px",
                                    }}
                                  >
                                    <strong
                                      style={{
                                        flex: 1,
                                        "text-overflow": "ellipsis",
                                        "white-space": "nowrap",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {file().previousPath ? `${file().previousPath} → ${file().path}` : file().path}
                                    </strong>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedFile(null)}
                                      style={{
                                        padding: 0,
                                        border: "none",
                                        background: "none",
                                        color: "inherit",
                                        cursor: "pointer",
                                        "font-size": "11px",
                                        opacity: 0.7,
                                      }}
                                    >
                                      {ctx.t("panel.closeDiff")}
                                    </button>
                                  </div>
                                  <Show
                                    when={!loadingDiff()}
                                    fallback={
                                      <span style={{ padding: "6px", "font-size": "11px", opacity: 0.65 }}>
                                        {ctx.t("panel.loadingDiff")}
                                      </span>
                                    }
                                  >
                                    <Show
                                      when={!diffError()}
                                      fallback={
                                        <span role="alert" style={{ padding: "6px", "font-size": "11px", color: "#da1e28" }}>
                                          {diffError()}
                                        </span>
                                      }
                                    >
                                      <Show
                                        when={!diffBinary()}
                                        fallback={
                                          <span style={{ padding: "6px", "font-size": "11px", opacity: 0.65 }}>
                                            {ctx.t("panel.binaryDiff")}
                                          </span>
                                        }
                                      >
                                        <Show
                                          when={diff().length > 0}
                                          fallback={
                                            <span style={{ padding: "6px", "font-size": "11px", opacity: 0.65 }}>
                                              {ctx.t("panel.noDiff")}
                                            </span>
                                          }
                                        >
                                          <div
                                            style={{
                                              "max-height": "320px",
                                              overflow: "auto",
                                              "font-family": "ui-monospace, SFMono-Regular, Menlo, monospace",
                                              "font-size": "10px",
                                              "line-height": 1.45,
                                              "tab-size": 2,
                                            }}
                                          >
                                            <For each={diffLines()}>
                                              {(line) => (
                                                <div
                                                  style={{
                                                    padding: "0 6px",
                                                    "white-space": "pre",
                                                    ...diffLineStyle(line),
                                                  }}
                                                >
                                                  {line || " "}
                                                </div>
                                              )}
                                            </For>
                                          </div>
                                          <Show when={diffTruncated()}>
                                            <span style={{ padding: "4px 6px", "font-size": "10px", opacity: 0.65 }}>
                                              {ctx.t("panel.diffTruncated")}
                                            </span>
                                          </Show>
                                        </Show>
                                      </Show>
                                    </Show>
                                  </Show>
                                </div>
                              )}
                            </Show>
                          </div>
                          <strong style={{ "margin-top": "2px" }}>{ctx.t("panel.containingBranches")}</strong>
                          <Show
                            when={!loadingContainingBranches()}
                            fallback={<span style={{ opacity: 0.65 }}>{ctx.t("panel.checkingBranches")}</span>}
                          >
                            <Show
                              when={!containingBranchesError()}
                              fallback={<span role="alert" style={{ color: "#da1e28" }}>{containingBranchesError()}</span>}
                            >
                              <Show
                                when={containingBranches().length > 0}
                                fallback={<span style={{ opacity: 0.65 }}>{ctx.t("panel.noContainingBranches")}</span>}
                              >
                                <div style={{ display: "flex", gap: "6px", "flex-wrap": "wrap" }}>
                                  <For each={containingBranchLabels()}>
                                    {(branch) => (
                                      <BranchPill
                                        name={branch.name}
                                        remotes={branch.remotes}
                                        hash={branch.hash}
                                        color={colorForBranch(branch)}
                                        current={branch.current}
                                        muted={!branch.current}
                                      />
                                    )}
                                  </For>
                                </div>
                              </Show>
                            </Show>
                          </Show>
                        </section>
                      </Show>
                    </>
                  )
                }}
              </For>
            </div>
          </div>

          <Show when={hasMore()}>
            <ctx.ui.Button size="small" busy={loadingMore()} onClick={() => void loadMore()}>
              {ctx.t("panel.loadMore")}
            </ctx.ui.Button>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
