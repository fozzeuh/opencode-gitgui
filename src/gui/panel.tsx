import type { MountedSession } from "@opencode/plugin/gui"
import { usePlugin } from "@opencode/plugin/gui"
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type { GitBranch, GitCommit } from "../git/reader"
import { layoutGraph } from "../graph/layout"
import { GitGraphRpc } from "../rpc"
import { combineBranchRefs, countLogicalBranches, type BranchLabel } from "../shared/branches"

const PAGE_SIZE = 50
const ROW_HEIGHT = 50
const LANE_WIDTH = 14
const GRAPH_COLORS = ["#78a9ff", "#42be65", "#ff7eb6", "#be95ff", "#f1c21b", "#33b1ff"]

export function GitGraphPanel(props: { readonly session: MountedSession }) {
  const ctx = usePlugin()
  const [root, setRoot] = createSignal("")
  const [commits, setCommits] = createSignal<GitCommit[]>([])
  const [branches, setBranches] = createSignal<GitBranch[]>([])
  const [containingBranches, setContainingBranches] = createSignal<GitBranch[]>([])
  const [currentBranch, setCurrentBranch] = createSignal<string | null>(null)
  const [selected, setSelected] = createSignal<string | null>(null)
  const [offset, setOffset] = createSignal(0)
  const [hasMore, setHasMore] = createSignal(false)
  const [loading, setLoading] = createSignal(true)
  const [loadingMore, setLoadingMore] = createSignal(false)
  const [loadingContainingBranches, setLoadingContainingBranches] = createSignal(false)
  const [containingBranchesError, setContainingBranchesError] = createSignal("")
  const [detailHeight, setDetailHeight] = createSignal(0)
  const [error, setError] = createSignal("")
  let generation = 0
  let branchRequest = 0
  let detailObserver: ResizeObserver | undefined

  const graph = createMemo(() => layoutGraph(commits()))
  const laneCount = createMemo(() => Math.max(1, ...graph().map((row) => row.lane + 1)))
  const graphWidth = createMemo(() => 16 + laneCount() * LANE_WIDTH)
  const laneByHash = createMemo(() => new Map(graph().map((row) => [row.hash, row.lane])))
  const branchLabels = createMemo(() => combineBranchRefs(branches()))
  const containingBranchLabels = createMemo(() => combineBranchRefs(containingBranches()))
  const branchOrder = createMemo(() => new Map(branchLabels().map((branch, index) => [branch.name, index])))
  const branchCount = createMemo(() => countLogicalBranches(branches()))
  const indexByHash = createMemo(() => new Map(commits().map((commit, index) => [commit.hash, index])))
  const selectedCommit = createMemo(() => commits().find((commit) => commit.hash === selected()))
  const selectedIndex = createMemo(() => commits().findIndex((commit) => commit.hash === selected()))
  const rowTop = (index: number) => index * ROW_HEIGHT + (selectedIndex() >= 0 && selectedIndex() < index ? detailHeight() : 0)
  const colorForLane = (lane: number) => GRAPH_COLORS[lane % GRAPH_COLORS.length]
  const colorForBranch = (branch: BranchLabel) =>
    colorForLane(laneByHash().get(branch.hash) ?? branchOrder().get(branch.name) ?? 0)

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
      const [history, branchInfo] = await Promise.all([
        client.history({ directory, limit: PAGE_SIZE, offset: 0 }),
        client.branches({ directory }),
      ])
      if (request !== generation) return
      setRoot(history.root)
      setCommits([...history.commits])
      setBranches([...branchInfo.branches])
      setCurrentBranch(branchInfo.current)
      setOffset(history.commits.length)
      setHasMore(history.commits.length === PAGE_SIZE)
    } catch (cause) {
      if (request === generation) setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (request === generation) setLoading(false)
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

  createEffect(() => {
    void refresh(props.session.directory)
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

  const shortHash = (hash: string) => hash.slice(0, 7)
  const commitDate = (timestamp: number) => new Date(timestamp * 1000).toLocaleString()

  function activateCommit(commit: GitCommit) {
    setSelected((current) => (current === commit.hash ? null : commit.hash))
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
      </header>

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
            <span>{currentBranch() || ctx.t("panel.detached")}</span>
            <span style={{ opacity: 0.6 }}>· {branchCount()} {ctx.t("panel.branches")}</span>
          </div>
          <div style={{ display: "flex", gap: "5px", "flex-wrap": "wrap" }}>
            <For each={branchLabels().slice(0, 8)}>
              {(branch) => (
                <span
                  title={`${branch.name}${branch.remotes.length ? ` · ${branch.remotes.join(", ")}` : ""} · ${shortHash(branch.hash)}`}
                  style={{
                    padding: "2px 6px",
                    "border-radius": "4px",
                    "font-size": "10px",
                    opacity: branch.current ? 1 : 0.65,
                    outline: branch.current ? "1px solid currentColor" : "none",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-block",
                      width: "7px",
                      height: "7px",
                      "margin-right": "4px",
                      "border-radius": "50%",
                      background: colorForBranch(branch),
                    }}
                  />
                  {branch.name}
                  <Show when={branch.remotes.length > 0}>
                    <span style={{ "margin-left": "4px", opacity: 0.65 }}>{branch.remotes.join(", ")}</span>
                  </Show>
                </span>
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
        <Show when={commits().length > 0} fallback={<span style={{ "font-size": "12px", opacity: 0.65 }}>{ctx.t("panel.empty")}</span>}>
          <div style={{ display: "grid", "grid-template-columns": `${graphWidth()}px minmax(0, 1fr)`, "align-items": "start" }}>
            <svg
              width={graphWidth()}
              height={commits().length * ROW_HEIGHT + (selectedCommit() ? detailHeight() : 0)}
              viewBox={`0 0 ${graphWidth()} ${commits().length * ROW_HEIGHT + (selectedCommit() ? detailHeight() : 0)}`}
              aria-hidden="true"
              style={{ overflow: "visible" }}
            >
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
                          const middle = (y + parentY) / 2
                          return (
                            <path
                              d={`M ${x} ${y} C ${x} ${middle}, ${parentX} ${middle}, ${parentX} ${parentY}`}
                              fill="none"
                              stroke={colorForLane(edge.fromLane)}
                              stroke-width="2"
                            />
                          )
                        }}
                      </For>
                      <circle cx={x} cy={y} r={4} fill={colorForLane(row.lane)} stroke="currentColor" stroke-width="1" />
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
                        <span style={{ display: "flex", gap: "6px", "font-size": "10px", opacity: 0.62, "white-space": "nowrap", overflow: "hidden" }}>
                          <code>{shortHash(commit.hash)}</code>
                          <span style={{ "text-overflow": "ellipsis", overflow: "hidden" }}>{commit.author}</span>
                          <Show when={commit.decorations}>
                            <span title={commit.decorations} style={{ opacity: 0.9 }}>{commit.decorations}</span>
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
                          <Show when={commit.parents.length > 0}>
                            <span style={{ "overflow-wrap": "anywhere" }}>
                              {ctx.t("panel.parents")} {commit.parents.map(shortHash).join(", ")}
                            </span>
                          </Show>
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
                                      <span
                                        title={`${branch.name}${branch.remotes.length ? ` · ${branch.remotes.join(", ")}` : ""} · ${shortHash(branch.hash)}`}
                                        style={{
                                          display: "inline-flex",
                                          "align-items": "center",
                                          gap: "5px",
                                          padding: "3px 7px",
                                          "border-radius": "4px",
                                          "background-color": "rgba(127, 127, 127, 0.14)",
                                          "font-size": "12px",
                                        }}
                                      >
                                        <span
                                          aria-hidden="true"
                                          style={{
                                            width: "8px",
                                            height: "8px",
                                            "border-radius": "50%",
                                            background: colorForBranch(branch),
                                          }}
                                        />
                                        {branch.name}
                                        <Show when={branch.remotes.length > 0}>
                                          <span style={{ opacity: 0.65 }}>{branch.remotes.join(", ")}</span>
                                        </Show>
                                      </span>
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
