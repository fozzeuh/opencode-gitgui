import { describe, expect, it } from "vitest"
import { edgePath, MERGE_ARROW_GAP } from "../graph/render"

const edge = { fromX: 8, fromY: 25, toX: 22, toY: 125 }

describe("edge rendering", () => {
  it("draws a regular edge from the commit down to its parent", () => {
    expect(edgePath(edge, false)).toBe(`M 8 25 C 8 75, 22 75, 22 125`)
  })

  it("draws a merge edge from the second parent up to the merge commit", () => {
    const path = edgePath(edge, true)

    expect(path).toBe(`M 22 125 C 22 75, 8 75, 8 ${25 + MERGE_ARROW_GAP}`)
  })

  it("stops the merge arrow below the merge node center", () => {
    const path = edgePath(edge, true)
    const endY = Number(path.split(" ").at(-1))

    expect(endY).toBeGreaterThan(edge.fromY)
    expect(endY).toBeLessThan(edge.toY)
  })
})
