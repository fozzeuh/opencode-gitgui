import { describe, expect, it } from "vitest"
import type { GitCommit } from "../git/reader"
import { layoutGraph } from "../graph/layout"

const commit = (hash: string, parents: string[] = []): GitCommit => ({
  hash,
  parents,
  author: "Test",
  timestamp: 1,
  subject: hash,
  decorations: "",
})

describe("commit graph layout", () => {
  it("keeps a linear history in one lane", () => {
    const graph = layoutGraph([commit("c", ["b"]), commit("b", ["a"]), commit("a")])

    expect(graph.map((row) => row.lane)).toEqual([0, 0, 0])
    expect(graph[0]?.edges).toEqual([{ parent: "b", fromLane: 0, toLane: 0 }])
  })

  it("splits merge parents into distinct lanes", () => {
    const graph = layoutGraph([
      commit("merge", ["left", "right"]),
      commit("left", ["base"]),
      commit("right", ["base"]),
      commit("base"),
    ])

    expect(graph.map((row) => row.lane)).toEqual([0, 0, 1, 0])
    expect(graph[0]?.edges).toEqual([
      { parent: "left", fromLane: 0, toLane: 0 },
      { parent: "right", fromLane: 0, toLane: 1 },
    ])
    expect(graph[2]?.edges).toEqual([{ parent: "base", fromLane: 1, toLane: 0 }])
  })

  it("omits edges to commits outside the loaded page", () => {
    expect(layoutGraph([commit("new", ["older"])])[0]?.edges).toEqual([])
  })
})
