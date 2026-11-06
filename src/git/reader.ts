import { spawn } from "node:child_process"
import { isAbsolute, resolve } from "node:path"

const MAX_HISTORY = 100
const MAX_OUTPUT = 4 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 10_000

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

function runGit(args: readonly string[], cwd: string, signal?: AbortSignal): Promise<string> {
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
    }, COMMAND_TIMEOUT_MS)

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
