import { spawn } from "node:child_process"
import { isAbsolute, resolve } from "node:path"

const MAX_HISTORY = 100
const MAX_FILES = 500
const MAX_PATCH = 256 * 1024
const MAX_OUTPUT = 4 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 10_000
const FETCH_TIMEOUT_MS = 120_000

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

function repositoryDirectory(directory: string): string {
  if (!directory || directory.length > 4096 || directory.includes("\0") || !isAbsolute(directory)) {
    throw new Error("The repository path must be a valid absolute path.")
  }
  return resolve(directory)
}

function runGit(
  args: readonly string[],
  cwd: string,
  signal?: AbortSignal,
  timeoutMs = COMMAND_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    if (signal?.aborted) {
      reject(new Error("The Git request was cancelled."))
      return
    }

    const child = spawn("git", [...args], {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputSize = 0
    let errorSize = 0
    let settled = false

    const finish = (error?: Error, output?: string) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abort)
      if (error) reject(error)
      else resolvePromise(output ?? "")
    }

    const abort = () => {
      child.kill("SIGTERM")
      finish(new Error("The Git request was cancelled."))
    }

    const timeout = setTimeout(() => {
      child.kill("SIGTERM")
      finish(new Error("The Git command exceeded the allowed time limit."))
    }, timeoutMs)

    signal?.addEventListener("abort", abort, { once: true })
    child.stdout.on("data", (chunk: Buffer) => {
      outputSize += chunk.length
      if (outputSize > MAX_OUTPUT) {
        child.kill("SIGTERM")
        finish(new Error("Git output exceeds the maximum allowed size."))
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      if (errorSize >= 16_384) return
      const remaining = 16_384 - errorSize
      const kept = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk
      stderr.push(kept)
      errorSize += kept.length
    })
    child.on("error", (error) => finish(new Error(`Impossible de lancer Git : ${error.message}`)))
    child.on("close", (code) => {
      if (code === 0) {
        finish(undefined, Buffer.concat(stdout).toString("utf8"))
        return
      }
      const detail = Buffer.concat(stderr).toString("utf8").trim()
      finish(new Error(detail || `Git exited with code ${code ?? "unknown"}.`))
    })
  })
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
        subject: subject ?? "(sans sujet)",
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

export async function readHistory(
  directory: string,
  requestedLimit: number,
  requestedOffset: number,
  signal?: AbortSignal,
): Promise<{ root: string; commits: GitCommit[] }> {
  const cwd = repositoryDirectory(directory)
  const root = (await runGit(["rev-parse", "--show-toplevel"], cwd, signal)).trim()
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(MAX_HISTORY, Math.floor(requestedLimit)))
    : 50
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.min(10_000, Math.floor(requestedOffset)))
    : 0
  const format = "%H%x00%P%x00%an%x00%at%x00%s%x00%D%x1e"
  const output = await runGit(
    [
      "log",
      "--all",
      "--topo-order",
      `--max-count=${limit}`,
      `--skip=${offset}`,
      `--format=${format}`,
    ],
    cwd,
    signal,
  )
  return { root, commits: parseGitLog(output) }
}

export async function readBranches(
  directory: string,
  signal?: AbortSignal,
): Promise<{ current: string | null; branches: GitBranch[] }> {
  const cwd = repositoryDirectory(directory)
  const currentOutput = await runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd, signal).catch(
    () => "",
  )
  const format = "%(refname)%00%(objectname)%00%(HEAD)%00"
  const output = await runGit(
    ["for-each-ref", `--format=${format}`, "refs/heads", "refs/remotes"],
    cwd,
    signal,
  )
  const branches = parseGitBranches(output)
  return { current: currentOutput.trim() || null, branches }
}

/** Fetch updates for every configured remote; this is only invoked on user request. */
export async function fetchAll(directory: string, signal?: AbortSignal): Promise<void> {
  const cwd = repositoryDirectory(directory)
  await runGit(["fetch", "--all"], cwd, signal, FETCH_TIMEOUT_MS)
}

export async function readBranchesContaining(
  directory: string,
  hash: string,
  signal?: AbortSignal,
): Promise<{ branches: GitBranch[] }> {
  if (!/^[0-9a-f]{40,64}$/i.test(hash)) {
    throw new Error("The commit hash is invalid.")
  }
  const cwd = repositoryDirectory(directory)
  const format = "%(refname)%00%(objectname)%00%(HEAD)%00"
  const output = await runGit(
    ["for-each-ref", `--contains=${hash}`, `--format=${format}`, "refs/heads", "refs/remotes"],
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
  if (!/^[0-9a-f]{40,64}$/i.test(hash)) {
    throw new Error("The commit hash is invalid.")
  }
  const cwd = repositoryDirectory(directory)
  const firstParent = await firstParentOf(cwd, hash, signal)
  const revisionArgs = ["diff-tree", "--no-commit-id", "-r", "-M"]
  const revision = firstParent ? [firstParent, hash] : ["--root", hash]
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
  if (!/^[0-9a-f]{40,64}$/i.test(hash)) {
    throw new Error("The commit hash is invalid.")
  }
  const filePath = commitPath(path)
  const oldPath = previousPath === null ? null : commitPath(previousPath)
  const cwd = repositoryDirectory(directory)
  const firstParent = await firstParentOf(cwd, hash, signal)
  const paths = oldPath && oldPath !== filePath ? [oldPath, filePath] : [filePath]
  const args = firstParent
    ? ["diff", "--no-color", "--unified=3", firstParent, hash, "--", ...paths]
    : ["show", "--format=", "--no-color", "--unified=3", hash, "--", ...paths]
  const output = await runGit(args, cwd, signal)
  const binary = /^Binary files .* differ$/m.test(output) || output.includes("GIT binary patch")
  const truncated = output.length > MAX_PATCH
  return {
    patch: truncated ? output.slice(0, MAX_PATCH) : output,
    binary,
    truncated,
  }
}
