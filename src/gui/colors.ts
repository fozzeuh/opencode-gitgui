/** Palette shared by graph lanes and branch labels. */
import type { GraphRow } from "../graph/layout"

export const GRAPH_COLORS = [
  "#78a9ff",
  "#42be65",
  "#ff7eb6",
  "#be95ff",
  "#f1c21b",
  "#33b1ff",
  "#ff832b",
  "#08bdba",
  "#a56eff",
  "#a8e05f",
] as const

export function laneColor(lane: number): string {
  const index = ((lane % GRAPH_COLORS.length) + GRAPH_COLORS.length) % GRAPH_COLORS.length
  return GRAPH_COLORS[index] ?? GRAPH_COLORS[0]
}

/** FNV-1a keeps a branch color stable across refreshes and pagination. */
function hashName(name: string): number {
  let hash = 2166136261
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Give every branch its own color. The hash seeds the choice, then collisions
 * are resolved by taking the next free slot so the visible pills stay distinct.
 */
export function branchColorMap(names: readonly string[]): Map<string, string> {
  const taken = new Set<number>()
  const colors = new Map<string, string>()

  for (const name of names) {
    if (colors.has(name)) continue

    let index = hashName(name) % GRAPH_COLORS.length
    for (let attempt = 0; attempt < GRAPH_COLORS.length && taken.has(index); attempt += 1) {
      index = (index + 1) % GRAPH_COLORS.length
    }
    taken.add(index)
    colors.set(name, GRAPH_COLORS[index] ?? GRAPH_COLORS[0])
  }

  return colors
}

/** Fallback for a branch that was not part of the loaded branch list. */
export function fallbackBranchColor(name: string): string {
  return GRAPH_COLORS[hashName(name) % GRAPH_COLORS.length] ?? GRAPH_COLORS[0]
}

export function colorIndex(color: string): number {
  const index = GRAPH_COLORS.findIndex((candidate) => candidate === color)
  return index >= 0 ? index : 0
}

export function edgeColorKey(hash: string, parent: string): string {
  return `${hash}\0${parent}`
}

export interface GraphColorAssignment {
  /** Color of the commit node, keyed by commit hash. */
  readonly rows: ReadonlyMap<string, string>
  /** Color of an edge, keyed by `edgeColorKey(fromHash, parentHash)`. */
  readonly edges: ReadonlyMap<string, string>
}

/**
 * Propagate branch colors along the graph. A branch tip seeds its lane with the
 * branch color; the color travels down the first-parent line until another
 * branch tip takes over. Merge edges use the merged branch color.
 */
export function assignGraphColors(
  rows: readonly GraphRow[],
  tipColors: ReadonlyMap<string, string>,
  colorForLane: (lane: number) => string,
): GraphColorAssignment {
  const laneColors = new Map<number, string>()
  const rowColors = new Map<string, string>()
  const edgeColors = new Map<string, string>()

  for (const row of rows) {
    const tipColor = tipColors.get(row.hash)
    const laneColor = laneColors.get(row.lane)

    let color: string
    if (tipColor !== undefined) {
      color = tipColor
      laneColors.set(row.lane, color)
    } else if (laneColor !== undefined && !row.laneStart) {
      color = laneColor
    } else {
      color = colorForLane(row.lane)
      laneColors.set(row.lane, color)
    }
    rowColors.set(row.hash, color)

    for (const edge of row.edges) {
      const key = edgeColorKey(row.hash, edge.parent)
      if (edge.merge) {
        // The merge link belongs to the branch being merged in, so that its
        // line, nodes, and edge all share one color.
        const parentColor = tipColors.get(edge.parent) ?? colorForLane(edge.toLane)
        laneColors.set(edge.toLane, parentColor)
        edgeColors.set(key, parentColor)
        continue
      }

      edgeColors.set(key, color)
      if (edge.toLane === row.lane && !laneColors.has(edge.toLane)) {
        laneColors.set(edge.toLane, color)
      }
    }
  }

  return { rows: rowColors, edges: edgeColors }
}
