import { describe, expect, it } from "vitest"
import type { GitCommit } from "../git/reader"
import { layoutGraph } from "../graph/layout"
import {
  assignGraphColors,
  branchColorMap,
  edgeColorKey,
  fallbackBranchColor,
  GRAPH_COLORS,
  laneColor,
} from "../gui/colors"

const commit = (hash: string, parents: string[] = []): GitCommit => ({
  hash,
  parents,
  author: "Test",
  timestamp: 1,
  subject: hash,
  decorations: "",
})

describe("graph colors", () => {
  it("cycles lane colors and supports negative lanes", () => {
    expect(laneColor(0)).toBe(GRAPH_COLORS[0])
    expect(laneColor(GRAPH_COLORS.length)).toBe(GRAPH_COLORS[0])
    expect(laneColor(-1)).toBe(GRAPH_COLORS[GRAPH_COLORS.length - 1])
  })

  it("gives visible branches distinct colors", () => {
    const names = ["main", "feat/graph-design", "fix/merge", "release/1.0", "origin/main"]
    const colors = branchColorMap(names)

    expect(colors.size).toBe(names.length)
    expect(new Set(colors.values()).size).toBe(names.length)
    for (const name of names) {
      expect(colors.get(name)).toBeDefined()
    }
  })

  it("keeps the same color for the same branch name", () => {
    const first = branchColorMap(["main", "feature"])
    const second = branchColorMap(["main", "feature"])

    expect(second.get("main")).toBe(first.get("main"))
    expect(second.get("feature")).toBe(first.get("feature"))
  })

  it("provides a stable fallback color", () => {
    expect(fallbackBranchColor("main")).toBe(fallbackBranchColor("main"))
    expect(GRAPH_COLORS).toContain(fallbackBranchColor("unknown"))
  })
})

describe("graph color assignment", () => {
  it("switches colors when an older branch tip takes over the lane", () => {
    const rows = layoutGraph([commit("feature", ["main"]), commit("main", ["base"]), commit("base")])
    const colors = assignGraphColors(
      rows,
      new Map([
        ["feature", "#aaaaaa"],
        ["main", "#bbbbbb"],
      ]),
      () => "#cccccc",
    )

    expect(colors.rows.get("feature")).toBe("#aaaaaa")
    expect(colors.rows.get("main")).toBe("#bbbbbb")
    expect(colors.rows.get("base")).toBe("#bbbbbb")
    expect(colors.edges.get(edgeColorKey("feature", "main"))).toBe("#aaaaaa")
    expect(colors.edges.get(edgeColorKey("main", "base"))).toBe("#bbbbbb")
  })

  it("colors a merge link with the merged branch color", () => {
    const rows = layoutGraph([
      commit("merge", ["left", "right"]),
      commit("left", ["base"]),
      commit("right", ["base"]),
      commit("base"),
    ])
    const colors = assignGraphColors(
      rows,
      new Map([
        ["merge", "#aaaaaa"],
        ["right", "#bbbbbb"],
      ]),
      () => "#cccccc",
    )

    expect(colors.rows.get("merge")).toBe("#aaaaaa")
    expect(colors.rows.get("right")).toBe("#bbbbbb")
    expect(colors.edges.get(edgeColorKey("merge", "right"))).toBe("#bbbbbb")
    expect(colors.edges.get(edgeColorKey("right", "base"))).toBe("#bbbbbb")
  })
})
