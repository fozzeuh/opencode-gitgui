import { existsSync } from "node:fs"
import { join } from "node:path"
import {
  commitHash,
  NETWORK_TIMEOUT_MS,
  repositoryDirectory,
  runGit,
  validBranchName,
} from "./exec"

export type GitOperation = "merge" | "cherry-pick" | "revert" | "rebase"
export type ResetMode = "soft" | "mixed" | "hard"

export interface GitStatus {
  /** True when no staged, unstaged, untracked, or conflicted entry exists. */
  readonly clean: boolean
  /** Checked-out branch, or null in detached HEAD state. */
  readonly branch: string | null
  readonly head: string | null
  readonly staged: number
  readonly unstaged: number
  readonly untracked: number
  readonly conflicted: number
  /** A multi-step operation left in progress, for example after a conflict. */
  readonly inProgress: GitOperation | null
}

interface StatusCounts {
  readonly staged: number
  readonly unstaged: number
  readonly untracked: number
  readonly conflicted: number
}

/**
 * Count `git status --porcelain=v1 -z` entries. Each record starts with a
 * two-letter XY code; rename and copy records are followed by the original
 * path, which must be skipped.
 */
export function parseGitStatus(output: string): StatusCounts {
  const tokens = output.split("\0")
  let staged = 0
  let unstaged = 0
  let untracked = 0
  let conflicted = 0

  for (let index = 0; index < tokens.length; index += 1) {
    const entry = tokens[index]
    if (!entry || entry.length < 3) continue

    const x = entry[0] ?? " "
    const y = entry[1] ?? " "

    if (x === "?" && y === "?") {
      untracked += 1
      continue
    }
    if (x === "!" && y === "!") continue

    // Rename/copy records carry the original path as the next NUL token.
    if (x === "R" || x === "C" || y === "R" || y === "C") index += 1

    const unmerged =
      x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")
    if (unmerged) {
      conflicted += 1
      continue
    }

    if (x !== " " && x !== "?") staged += 1
    if (y !== " ") unstaged += 1
  }

  return { staged, unstaged, untracked, conflicted }
}

function operationInProgress(gitDirectory: string): GitOperation | null {
  if (existsSync(join(gitDirectory, "MERGE_HEAD"))) return "merge"
  if (existsSync(join(gitDirectory, "CHERRY_PICK_HEAD"))) return "cherry-pick"
  if (existsSync(join(gitDirectory, "REVERT_HEAD"))) return "revert"
  if (
    existsSync(join(gitDirectory, "rebase-merge")) ||
    existsSync(join(gitDirectory, "rebase-apply"))
  ) {
    return "rebase"
  }
  return null
}

async function currentBranch(cwd: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const name = (await runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], cwd, signal)).trim()
    return name || null
  } catch (cause) {
    if (signal?.aborted) throw cause
    return null
  }
}

async function currentHead(cwd: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const hash = (await runGit(["rev-parse", "--verify", "HEAD"], cwd, signal)).trim()
    return /^[0-9a-f]{40,64}$/i.test(hash) ? hash : null
  } catch (cause) {
    if (signal?.aborted) throw cause
    return null
  }
}

/** Read the working tree state, including any operation left in progress. */
export async function readStatus(
  directory: string,
  signal?: AbortSignal,
): Promise<GitStatus> {
  const cwd = repositoryDirectory(directory)
  const [output, branch, head, gitDirectory] = await Promise.all([
    runGit(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], cwd, signal),
    currentBranch(cwd, signal),
    currentHead(cwd, signal),
    runGit(["rev-parse", "--absolute-git-dir"], cwd, signal).then((value) => value.trim()),
  ])
  const counts = parseGitStatus(output)
  return {
    clean:
      counts.staged === 0 &&
      counts.unstaged === 0 &&
      counts.untracked === 0 &&
      counts.conflicted === 0,
    branch,
    head,
    ...counts,
    inProgress: operationInProgress(gitDirectory),
  }
}

export async function readRemotes(
  directory: string,
  signal?: AbortSignal,
): Promise<{ remotes: string[] }> {
  const cwd = repositoryDirectory(directory)
  const output = await runGit(["remote"], cwd, signal)
  return { remotes: output.split("\n").map((name) => name.trim()).filter(Boolean) }
}

/**
 * Check out an existing local branch. The branch must resolve to
 * `refs/heads/<name>`; remote names and revision expressions are refused.
 */
export async function checkoutBranch(
  directory: string,
  branch: string,
  signal?: AbortSignal,
): Promise<void> {
  const cwd = repositoryDirectory(directory)
  const name = validBranchName(branch)
  await runGit(["rev-parse", "--verify", "--quiet", `refs/heads/${name}^{commit}`], cwd, signal)
  await runGit(["checkout", name], cwd, signal)
}

/** Check out a commit in detached HEAD state. */
export async function checkoutCommit(
  directory: string,
  hash: string,
  signal?: AbortSignal,
): Promise<void> {
  const cwd = repositoryDirectory(directory)
  await runGit(["checkout", "--detach", commitHash(hash)], cwd, signal)
}

export async function cherryPick(
  directory: string,
  hash: string,
  signal?: AbortSignal,
): Promise<void> {
  const cwd = repositoryDirectory(directory)
  await runGit(["cherry-pick", commitHash(hash)], cwd, signal)
}

export async function revert(
  directory: string,
  hash: string,
  signal?: AbortSignal,
): Promise<void> {
  const cwd = repositoryDirectory(directory)
  await runGit(["revert", "--no-edit", commitHash(hash)], cwd, signal)
}

const RESET_MODES: readonly ResetMode[] = ["soft", "mixed", "hard"]

export async function reset(
  directory: string,
  hash: string,
  mode: ResetMode,
  signal?: AbortSignal,
): Promise<void> {
  if (!RESET_MODES.includes(mode)) {
    throw new Error("The reset mode is invalid.")
  }
  const cwd = repositoryDirectory(directory)
  await runGit(["reset", `--${mode}`, commitHash(hash)], cwd, signal)
}

/**
 * Push a local branch to a configured remote. The remote must appear in
 * `git remote`, and the source and destination are always explicit refs, so
 * the GUI cannot inject a refspec or an option.
 */
export async function push(
  directory: string,
  remote: string,
  branch: string,
  signal?: AbortSignal,
): Promise<void> {
  const cwd = repositoryDirectory(directory)
  const remoteName = remote.trim()
  const branchName = validBranchName(branch)
  if (!remoteName || remoteName.length > 1024 || /[\0\r\n]/.test(remoteName)) {
    throw new Error("The remote name is invalid.")
  }
  const { remotes } = await readRemotes(directory, signal)
  if (!remotes.includes(remoteName)) {
    throw new Error(`Unknown remote: ${remoteName}`)
  }
  await runGit(
    ["push", "--", remoteName, `refs/heads/${branchName}:refs/heads/${branchName}`],
    cwd,
    signal,
    NETWORK_TIMEOUT_MS,
  )
}

/** Fast-forward the current branch from its upstream, without creating a merge. */
export async function pull(directory: string, signal?: AbortSignal): Promise<void> {
  const cwd = repositoryDirectory(directory)
  await runGit(["pull", "--ff-only"], cwd, signal, NETWORK_TIMEOUT_MS)
}
