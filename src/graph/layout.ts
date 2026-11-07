import type { GitCommit } from "../git/reader"

export interface GraphEdge {
  readonly parent: string
  /** Index of the parent in the commit's parent list: 0 is the mainline. */
  readonly parentIndex: number
  /** True for the extra parents of a merge commit. */
  readonly merge: boolean
  readonly fromLane: number
  readonly toLane: number
}

export interface GraphRow {
  readonly hash: string
  readonly lane: number
  /** True when this commit opened its lane instead of inheriting a pending one. */
  readonly laneStart: boolean
  readonly merge: boolean
  readonly edges: readonly GraphEdge[]
}

/** Assign stable lanes to the visible commit slice and connect visible parents. */
export function layoutGraph(commits: readonly GitCommit[]): GraphRow[] {
  const visible = new Set(commits.map((commit) => commit.hash))
  const pending = new Map<string, number>()
  const rows: GraphRow[] = []

  const firstFreeLane = (reserved?: number) => {
    const occupied = new Set(pending.values())
    if (reserved !== undefined) occupied.add(reserved)
    let lane = 0
    while (occupied.has(lane)) lane += 1
    return lane
  }

  for (const commit of commits) {
    const pendingLane = pending.get(commit.hash)
    const laneStart = pendingLane === undefined
    const lane = pendingLane ?? firstFreeLane()
    pending.delete(commit.hash)
    const edges: GraphEdge[] = []

    for (const [index, parent] of commit.parents.entries()) {
      if (!visible.has(parent)) continue
      let parentLane = pending.get(parent)
      if (parentLane === undefined) {
        parentLane = index === 0 ? lane : firstFreeLane(lane)
        pending.set(parent, parentLane)
      }
      edges.push({
        parent,
        parentIndex: index,
        merge: index > 0,
        fromLane: lane,
        toLane: parentLane,
      })
    }
    rows.push({ hash: commit.hash, lane, laneStart, merge: commit.parents.length > 1, edges })
  }

  return rows
}
