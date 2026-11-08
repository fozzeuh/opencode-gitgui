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

/**
 * Assign stable lanes and connect visible parents.
 *
 * Lanes are tracked as pending parent hashes. The first parent continues the
 * current lane, merge parents open a lane to the right, and a lane that reaches
 * a parent already tracked by another lane joins it. Keeping the leftmost lane
 * makes a merged branch rejoin the main line instead of dragging the main line
 * onto the side branch, which is the shape every Git GUI draws.
 */
export function layoutGraph(commits: readonly GitCommit[]): GraphRow[] {
  const visible = new Set(commits.map((commit) => commit.hash))
  const lanes: (string | null)[] = []
  const laneByHash = new Map<string, number>()
  const laneStartByHash = new Map<string, boolean>()

  const allocate = (after: number): number => {
    for (let index = after + 1; index < lanes.length; index += 1) {
      if (lanes[index] === null) return index
    }
    lanes.push(null)
    return lanes.length - 1
  }

  for (const commit of commits) {
    const matching: number[] = []
    for (let index = 0; index < lanes.length; index += 1) {
      if (lanes[index] === commit.hash) matching.push(index)
    }

    const lane = matching[0] ?? allocate(-1)
    for (const duplicate of matching.slice(1)) lanes[duplicate] = null

    const firstParent = commit.parents[0]
    const visibleFirst =
      firstParent !== undefined && visible.has(firstParent) ? firstParent : undefined
    lanes[lane] = visibleFirst ?? null

    for (const parent of commit.parents.slice(1)) {
      if (!visible.has(parent) || lanes.includes(parent)) continue
      lanes[allocate(lane)] = parent
    }

    if (visibleFirst !== undefined) {
      const holders: number[] = []
      for (let index = 0; index < lanes.length; index += 1) {
        if (lanes[index] === visibleFirst) holders.push(index)
      }
      if (holders.length > 1) {
        const keep = holders[0] ?? lane
        for (const holder of holders) {
          if (holder !== keep) lanes[holder] = null
        }
        if (lane !== keep) lanes[lane] = null
      }
    }

    laneByHash.set(commit.hash, lane)
    laneStartByHash.set(commit.hash, matching.length === 0)
  }

  return commits.map((commit) => {
    const lane = laneByHash.get(commit.hash) ?? 0
    const edges: GraphEdge[] = []

    for (const [parentIndex, parent] of commit.parents.entries()) {
      const toLane = laneByHash.get(parent)
      if (toLane === undefined) continue
      edges.push({
        parent,
        parentIndex,
        merge: parentIndex > 0,
        fromLane: lane,
        toLane,
      })
    }

    return {
      hash: commit.hash,
      lane,
      laneStart: laneStartByHash.get(commit.hash) ?? true,
      merge: commit.parents.length > 1,
      edges,
    }
  })
}
