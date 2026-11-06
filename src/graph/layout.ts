import type { GitCommit } from "../git/reader"

export interface GraphEdge {
  readonly parent: string
  readonly fromLane: number
  readonly toLane: number
}

export interface GraphRow {
  readonly hash: string
  readonly lane: number
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
    const lane = pending.get(commit.hash) ?? firstFreeLane()
    pending.delete(commit.hash)
    const edges: GraphEdge[] = []

    for (const [index, parent] of commit.parents.entries()) {
      if (!visible.has(parent)) continue
      let parentLane = pending.get(parent)
      if (parentLane === undefined) {
        parentLane = index === 0 ? lane : firstFreeLane(lane)
        pending.set(parent, parentLane)
      }
      edges.push({ parent, fromLane: lane, toLane: parentLane })
    }
    rows.push({ hash: commit.hash, lane, edges })
  }

  return rows
}
