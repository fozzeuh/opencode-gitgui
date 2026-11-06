import type { GitBranch } from "../git/reader"

export interface BranchLabel {
  /** Local branch name, or the full remote name when there is no local equivalent. */
  readonly name: string
  readonly hash: string
  readonly current: boolean
  /** Matching remote refs combined into this label. */
  readonly remotes: readonly string[]
}

/** Combine local/remote labels when both point to the same named branch tip. */
export function combineBranchRefs(branches: readonly GitBranch[]): BranchLabel[] {
  const grouped = new Map<
    string,
    { name: string; hash: string; current: boolean; localName?: string; remotes: string[] }
  >()

  for (const branch of branches) {
    // Remote HEAD is an alias for the remote's default branch, not another branch.
    if (branch.remote && /(?:^|\/)HEAD$/.test(branch.name)) continue

    const name = branch.remote ? branch.name.slice(branch.name.indexOf("/") + 1) : branch.name
    const key = `${name}\0${branch.hash}`
    let group = grouped.get(key)
    if (!group) {
      group = { name, hash: branch.hash, current: false, remotes: [] }
      grouped.set(key, group)
    }

    if (branch.remote) group.remotes.push(branch.name)
    else {
      group.localName = branch.name
      group.current ||= branch.current
    }
  }

  return [...grouped.values()].map((group) => {
    const localName = group.localName
    const remoteNames = group.remotes
    return {
      name: localName ?? remoteNames[0] ?? group.name,
      hash: group.hash,
      current: group.current,
      remotes: localName ? remoteNames : remoteNames.slice(1),
    }
  })
}

/** Count distinct branch names/tips, collapsing identical local and remote refs. */
export function countLogicalBranches(branches: readonly GitBranch[]): number {
  return combineBranchRefs(branches).length
}
