import { spawn } from "node:child_process"
import { isAbsolute, resolve } from "node:path"

export const MAX_OUTPUT = 4 * 1024 * 1024
export const COMMAND_TIMEOUT_MS = 10_000
export const NETWORK_TIMEOUT_MS = 120_000

/** Reject any repository path that is not an absolute, NUL-free path. */
export function repositoryDirectory(directory: string): string {
  if (!directory || directory.length > 4096 || directory.includes("\0") || !isAbsolute(directory)) {
    throw new Error("The repository path must be a valid absolute path.")
  }
  return resolve(directory)
}

/**
 * Run Git with separated arguments and the shell disabled. Every caller passes a
 * fixed argument list; nothing from the GUI is interpolated into a command.
 */
export function runGit(
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
    child.on("error", (error) => finish(new Error(`Unable to launch Git: ${error.message}`)))
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

/** Validate a logical branch name before it reaches Git. */
export function validBranchName(value: string): string {
  const name = value.trim()
  if (
    !name ||
    name.length > 1024 ||
    name.startsWith("-") ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.includes("..") ||
    name.includes("@{") ||
    /[\0\r\n ~^:?*[\\]/.test(name)
  ) {
    throw new Error("The branch name is invalid.")
  }
  return name
}

/** Validate a full commit hash. Abbreviated hashes are not accepted by actions. */
export function commitHash(value: string): string {
  if (!/^[0-9a-f]{40,64}$/i.test(value)) {
    throw new Error("The commit hash is invalid.")
  }
  return value
}
