import {
  commitHash,
  NETWORK_TIMEOUT_MS,
  repositoryDirectory,
  runGit,
  validBranchName,
} from "./exec"

const MAX_HISTORY = 300
const MAX_SEARCH_LENGTH = 500
const MAX_FILES = 500
const MAX_PATCH = 256 * 1024

export type GitFileStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "type-changed"
  | "unknown"

export interface GitFileChange {
  readonly path: string
  readonly previousPath: string | null
  readonly status: GitFileStatus
  readonly additions: number | null
  readonly deletions: number | null
  readonly binary: boolean
}

export interface GitFileDiff {
  readonly patch: string
  readonly binary: boolean
  readonly truncated: boolean
}

export interface GitCommit {
  readonly hash: string
  readonly parents: readonly string[]
  readonly author: string
  readonly timestamp: number
  readonly subject: string
  readonly decorations: string
}

export interface GitBranch {
  readonly name: string
  readonly hash: string
  readonly remote: boolean
  readonly current: boolean
}

export interface GitTag {
  readonly name: string
  readonly hash: string
}

export interface HistoryOptions {
  /** Message or hash search. Empty or omitted means no search. */
  readonly query?: string
  /** Logical branch name to follow; null or omitted means every ref. */
  readonly branch?: string | null
}

export function parseGitLog(output: string): GitCommit[] {
  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, parentField, author, timestamp, subject, decorations, ...rest] = record.split("\0")
      if (rest.length || !hash || !/^[0-9a-f]{40,64}$/i.test(hash)) {
        throw new Error("Git returned an invalid commit record.")
      }
      const parsedTimestamp = Number(timestamp)
      if (!Number.isFinite(parsedTimestamp)) {
        throw new Error("Git returned an invalid commit timestamp.")
      }
      return {
        hash,
        parents: parentField ? parentField.split(" ").filter(Boolean) : [],
        author: author ?? "",
        timestamp: parsedTimestamp,
        subject: subject ?? "(no subject)",
        decorations: decorations ?? "",
      }
    })
}

export function parseGitBranches(output: string): GitBranch[] {
  return output.split("\n").filter(Boolean).flatMap((line): GitBranch[] => {
    const [ref = "", hash, head] = line.split("\0")
    if (!hash || !/^[0-9a-f]{40,64}$/i.test(hash)) return []
    const remote = ref.startsWith("refs/remotes/")
    const prefix = remote ? "refs/remotes/" : "refs/heads/"
    return [{
      name: ref.startsWith(prefix) ? ref.slice(prefix.length) : ref,
      hash,
      remote,
      current: head === "*",
    }]
  })
}

/**
 * Parse `for-each-ref` output for tags. Annotated tags are peeled to the
 * commit they point at, and tags that do not point at a commit are ignored.
 */
export function parseGitTags(output: string): GitTag[] {
  return output.split("\n").filter(Boolean).flatMap((line): GitTag[] => {
    const [name = "", objectType = "", objectHash = "", peeledType = "", peeledHash = ""] = line.split("\0")
    const type = peeledType || objectType
    const hash = peeledHash || objectHash
    if (!name || type !== "commit" || !/^[0-9a-f]{40,64}$/i.test(hash)) return []
    return [{ name, hash }]
  })
}

interface CommitFileStatusEntry {
  readonly path: string
  readonly previousPath: string | null
  readonly status: GitFileStatus
}

interface CommitFileStatsEntry {
  readonly path: string
  readonly additions: number | null
  readonly deletions: number | null
  readonly binary: boolean
}

const FILE_STATUS: Record<string, GitFileStatus> = {
  A: "added",
  M: "modified",
  D: "deleted",
  R: "renamed",
  C: "copied",
  T: "type-changed",
}

export function parseCommitFileStatus(output: string): CommitFileStatusEntry[] {
  const tokens = output.split("\0")
  const entries: CommitFileStatusEntry[] = []
  let index = 0

  while (index < tokens.length) {
    const token = tokens[index]
    index += 1
    if (!token) continue

    const code = token[0] ?? ""
    const status = FILE_STATUS[code] ?? "unknown"
    const firstPath = tokens[index]
    index += 1
    if (firstPath === undefined || firstPath === "") {
      throw new Error("Git returned an invalid file status record.")
    }

    if (code === "R" || code === "C") {
      const secondPath = tokens[index]
      index += 1
      if (secondPath === undefined || secondPath === "") {
        throw new Error("Git returned an invalid file status record.")
      }
      entries.push({ previousPath: firstPath, path: secondPath, status })
    } else {
      entries.push({ previousPath: null, path: firstPath, status })
    }
  }

  return entries
}

export function parseCommitFileStats(output: string): CommitFileStatsEntry[] {
  const tokens = output.split("\0")
  const entries: CommitFileStatsEntry[] = []
  let index = 0

  while (index < tokens.length) {
    const token = tokens[index]
    index += 1
    if (!token) continue

    const firstTab = token.indexOf("\t")
    const secondTab = firstTab === -1 ? -1 : token.indexOf("\t", firstTab + 1)
    if (firstTab === -1 || secondTab === -1) {
      throw new Error("Git returned an invalid file stats record.")
    }

    const additionField = token.slice(0, firstTab)
    const deletionField = token.slice(firstTab + 1, secondTab)
    let path = token.slice(secondTab + 1)
    if (!path) {
      const previousPath = tokens[index]
      const currentPath = tokens[index + 1]
      index += 2
      if (!previousPath || !currentPath) {
        throw new Error("Git returned an invalid file stats record.")
      }
      path = currentPath
    }

    const binary = additionField === "-" || deletionField === "-"
    const additions = binary ? null : Number(additionField)
    const deletions = binary ? null : Number(deletionField)
    if (
      (additions !== null && (!Number.isSafeInteger(additions) || additions < 0)) ||
      (deletions !== null && (!Number.isSafeInteger(deletions) || deletions < 0))
    ) {
      throw new Error("Git returned an invalid file stats record.")
    }

    entries.push({ path, additions, deletions, binary })
  }

  return entries
}

export function mergeCommitFiles(
  statuses: readonly CommitFileStatusEntry[],
  stats: readonly CommitFileStatsEntry[],
): GitFileChange[] {
  const statsByPath = new Map(stats.map((entry) => [entry.path, entry]))
  return statuses.map((entry) => {
    const stat = statsByPath.get(entry.path)
    return {
      path: entry.path,
      previousPath: entry.previousPath,
      status: entry.status,
      additions: stat?.additions ?? null,
      deletions: stat?.deletions ?? null,
      binary: stat?.binary ?? false,
    }
  })
}

function normalizeQuery(value: string | undefined): string {
  const query = (value ?? "").trim()
  if (query.length > MAX_SEARCH_LENGTH) {
    throw new Error("The search query is too long.")
  }
  if (/[\0\r\n]/.test(query)) {
    throw new Error("The search query contains invalid characters.")
  }
  return query
}

/** Resolve a logical branch label to a full local or remote ref. */
async function resolveBranchRef(
  cwd: string,
  branch: string,
  signal?: AbortSignal,
): Promise<string> {
  const name = validBranchName(branch)
  for (const ref of [`refs/heads/${name}`, `refs/remotes/${name}`]) {
    try {
      await runGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd, signal)
      return ref
    } catch (cause) {
      if (signal?.aborted) throw cause
    }
  }
  throw new Error(`Unknown branch: ${name}`)
}

/** Resolve a full or abbreviated hash to a commit, if the query is hash-like. */
async function resolveCommit(
  cwd: string,
  query: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!/^[0-9a-f]{4,64}$/i.test(query)) return null
  try {
    const hash = (await runGit(["rev-parse", "--verify", "--quiet", `${query}^{commit}`], cwd, signal)).trim()
    return /^[0-9a-f]{40,64}$/i.test(hash) ? hash : null
  } catch (cause) {
    if (signal?.aborted) throw cause
    return null
  }
}

export async function readHistory(
  directory: string,
  requestedLimit: number,
  requestedOffset: number,
  signal?: AbortSignal,
  options: HistoryOptions = {},
): Promise<{ root: string; commits: GitCommit[] }> {
  const cwd = repositoryDirectory(directory)
  const root = (await runGit(["rev-parse", "--show-toplevel"], cwd, signal)).trim()
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_HISTORY, Math.floor(requestedLimit)))
    : 50
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.min(10_000, Math.floor(requestedOffset)))
    : 0
  const query = normalizeQuery(options.query)
  const branchRef = options.branch ? await resolveBranchRef(cwd, options.branch, signal) : null
  const format = "%H%x00%P%x00%an%x00%at%x00%s%x00%D%x1e"

  const hash = query ? await resolveCommit(cwd, query, signal) : null
  if (hash) {
    if (offset > 0) return { root, commits: [] }
    if (branchRef) {
      try {
        await runGit(["merge-base", "--is-ancestor", hash, branchRef], cwd, signal)
      } catch (cause) {
        if (signal?.aborted) throw cause
        return { root, commits: [] }
      }
    }
    const output = await runGit(["show", "-s", `--format=${format}`, hash], cwd, signal)
    return { root, commits: parseGitLog(output) }
  }

  const args = [
    "log",
    ...(branchRef ? [branchRef] : ["--all"]),
    "--topo-order",
    `--max-count=${limit}`,
    `--skip=${offset}`,
    `--format=${format}`,
  ]
  if (query) {
    args.push("--fixed-strings", "--regexp-ignore-case", `--grep=${query}`)
  }
  const output = await runGit(args, cwd, signal)
  return { root, commits: parseGitLog(output) }
}

export async function readBranches(
  directory: string,
  signal?: AbortSignal,
): Promise<{ current: string | null; head: string | null; branches: GitBranch[] }> {
  const cwd = repositoryDirectory(directory)
  const currentOutput = await runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd, signal).catch(
    () => "",
  )
  let head: string | null = null
  try {
    const resolved = (await runGit(["rev-parse", "--verify", "HEAD"], cwd, signal)).trim()
    if (/^[0-9a-f]{40,64}$/i.test(resolved)) head = resolved
  } catch (cause) {
    if (signal?.aborted) throw cause
  }
  const format = "%(refname)%00%(objectname)%00%(HEAD)%00"
  const output = await runGit(
    ["for-each-ref", `--format=${format}`, "refs/heads", "refs/remotes"],
    cwd,
    signal,
  )
  const branches = parseGitBranches(output)
  return { current: currentOutput.trim() || null, head, branches }
}

export async function readTags(
  directory: string,
  signal?: AbortSignal,
): Promise<{ tags: GitTag[] }> {
  const cwd = repositoryDirectory(directory)
  const format =
    "%(refname:short)%00%(objecttype)%00%(objectname)%00%(*objecttype)%00%(*objectname)%00"
  const output = await runGit(["for-each-ref", `--format=${format}`, "refs/tags"], cwd, signal)
  return { tags: parseGitTags(output) }
}

/** Fetch updates for every configured remote; this is only invoked on user request. */
export async function fetchAll(directory: string, signal?: AbortSignal): Promise<void> {
  const cwd = repositoryDirectory(directory)
  await runGit(["fetch", "--all"], cwd, signal, NETWORK_TIMEOUT_MS)
}

export async function readBranchesContaining(
  directory: string,
  hash: string,
  signal?: AbortSignal,
): Promise<{ branches: GitBranch[] }> {
  const commit = commitHash(hash)
  const cwd = repositoryDirectory(directory)
  const format = "%(refname)%00%(objectname)%00%(HEAD)%00"
  const output = await runGit(
    ["for-each-ref", `--contains=${commit}`, `--format=${format}`, "refs/heads", "refs/remotes"],
    cwd,
    signal,
  )
  return { branches: parseGitBranches(output) }
}

async function firstParentOf(
  cwd: string,
  hash: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const line = (await runGit(["rev-list", "--parents", "-n", "1", hash], cwd, signal)).trim()
  return line.split(" ")[1] ?? null
}

function commitPath(path: string): string {
  if (!path || path.length > 4096 || path.includes("\0")) {
    throw new Error("The file path is invalid.")
  }
  return path
}

export async function readCommitFiles(
  directory: string,
  hash: string,
  signal?: AbortSignal,
): Promise<{ files: GitFileChange[]; truncated: boolean }> {
  const commit = commitHash(hash)
  const cwd = repositoryDirectory(directory)
  const firstParent = await firstParentOf(cwd, commit, signal)
  const revisionArgs = ["diff-tree", "--no-commit-id", "-r", "-M"]
  const revision = firstParent ? [firstParent, commit] : ["--root", commit]
  const [statusOutput, statsOutput] = await Promise.all([
    runGit([...revisionArgs, "--name-status", "-z", ...revision], cwd, signal),
    runGit([...revisionArgs, "--numstat", "-z", ...revision], cwd, signal),
  ])
  const files = mergeCommitFiles(
    parseCommitFileStatus(statusOutput),
    parseCommitFileStats(statsOutput),
  )
  return { files: files.slice(0, MAX_FILES), truncated: files.length > MAX_FILES }
}

export async function readCommitFileDiff(
  directory: string,
  hash: string,
  path: string,
  previousPath: string | null,
  signal?: AbortSignal,
): Promise<GitFileDiff> {
  const commit = commitHash(hash)
  const filePath = commitPath(path)
  const oldPath = previousPath === null ? null : commitPath(previousPath)
  const cwd = repositoryDirectory(directory)
  const firstParent = await firstParentOf(cwd, commit, signal)
  const paths = oldPath && oldPath !== filePath ? [oldPath, filePath] : [filePath]
  const args = firstParent
    ? ["diff", "--no-color", "--unified=3", firstParent, commit, "--", ...paths]
    : ["show", "--format=", "--no-color", "--unified=3", commit, "--", ...paths]
  const output = await runGit(args, cwd, signal)
  const binary = /^Binary files .* differ$/m.test(output) || output.includes("GIT binary patch")
  const truncated = output.length > MAX_PATCH
  return {
    patch: truncated ? output.slice(0, MAX_PATCH) : output,
    binary,
    truncated,
  }
}
