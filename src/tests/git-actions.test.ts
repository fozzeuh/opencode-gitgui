import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  checkoutBranch,
  checkoutCommit,
  cherryPick,
  parseGitStatus,
  pull,
  push,
  readRemotes,
  readStatus,
  reset,
  revert,
} from "../git/actions"

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Git Graph Test",
  GIT_AUTHOR_EMAIL: "git-graph@example.invalid",
  GIT_COMMITTER_NAME: "Git Graph Test",
  GIT_COMMITTER_EMAIL: "git-graph@example.invalid",
}

const git = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, stdio: "ignore", env })

const gitOut = (cwd: string, args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env }).trim()

function temporaryRepository(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe("Git status parsing", () => {
  it("counts staged, unstaged, untracked, and conflicted entries", () => {
    const output = [
      "M  staged.txt",
      " M unstaged.txt",
      "?? new.txt",
      "UU conflicted.txt",
      "R  renamed.txt",
      "old.txt",
      "",
    ].join("\0")

    expect(parseGitStatus(output)).toEqual({
      staged: 2,
      unstaged: 1,
      untracked: 1,
      conflicted: 1,
    })
  })

  it("returns zero counts for a clean working tree", () => {
    expect(parseGitStatus("")).toEqual({
      staged: 0,
      unstaged: 0,
      untracked: 0,
      conflicted: 0,
    })
  })
})

describe("Git action integration", () => {
  it("checks out branches and commits, and reports the working tree state", async () => {
    const directory = temporaryRepository("git-graph-checkout-")

    try {
      git(directory, ["init", "-b", "main"])
      writeFileSync(join(directory, "sample.txt"), "first\n")
      git(directory, ["add", "sample.txt"])
      git(directory, ["commit", "-m", "Initial commit"])
      git(directory, ["checkout", "-b", "feature"])
      writeFileSync(join(directory, "feature.txt"), "feature\n")
      git(directory, ["add", "feature.txt"])
      git(directory, ["commit", "-m", "Feature commit"])
      const featureHash = gitOut(directory, ["rev-parse", "HEAD"])
      git(directory, ["checkout", "main"])
      const mainHash = gitOut(directory, ["rev-parse", "HEAD"])

      expect((await readStatus(directory)).clean).toBe(true)

      await checkoutBranch(directory, "feature")
      expect((await readStatus(directory)).branch).toBe("feature")

      await checkoutCommit(directory, mainHash)
      const detached = await readStatus(directory)
      expect(detached.branch).toBeNull()
      expect(detached.head).toBe(mainHash)
      expect(detached.clean).toBe(true)

      await checkoutCommit(directory, featureHash)
      expect((await readStatus(directory)).head).toBe(featureHash)

      writeFileSync(join(directory, "feature.txt"), "changed\n")
      const dirty = await readStatus(directory)
      expect(dirty.clean).toBe(false)
      expect(dirty.unstaged).toBe(1)

      writeFileSync(join(directory, "untracked.txt"), "new\n")
      expect((await readStatus(directory)).untracked).toBe(1)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("refuses a checkout that would overwrite local changes", async () => {
    const directory = temporaryRepository("git-graph-checkout-dirty-")

    try {
      git(directory, ["init", "-b", "main"])
      writeFileSync(join(directory, "sample.txt"), "first\n")
      git(directory, ["add", "sample.txt"])
      git(directory, ["commit", "-m", "Initial commit"])
      git(directory, ["checkout", "-b", "feature"])
      writeFileSync(join(directory, "sample.txt"), "feature\n")
      git(directory, ["commit", "-am", "Feature change"])
      git(directory, ["checkout", "main"])
      writeFileSync(join(directory, "sample.txt"), "local work\n")

      await expect(checkoutBranch(directory, "feature")).rejects.toThrow()
      expect((await readStatus(directory)).branch).toBe("main")
      expect(gitOut(directory, ["status", "--porcelain"])).toContain("sample.txt")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("cherry-picks a commit onto the current branch", async () => {
    const directory = temporaryRepository("git-graph-cherry-pick-")

    try {
      git(directory, ["init", "-b", "main"])
      writeFileSync(join(directory, "base.txt"), "base\n")
      git(directory, ["add", "base.txt"])
      git(directory, ["commit", "-m", "Base commit"])
      git(directory, ["checkout", "-b", "feature"])
      writeFileSync(join(directory, "picked.txt"), "picked\n")
      git(directory, ["add", "picked.txt"])
      git(directory, ["commit", "-m", "Feature commit"])
      const picked = gitOut(directory, ["rev-parse", "HEAD"])
      git(directory, ["checkout", "main"])

      await cherryPick(directory, picked)

      expect(gitOut(directory, ["log", "-1", "--format=%s"])).toBe("Feature commit")
      expect(gitOut(directory, ["rev-parse", "HEAD"])).not.toBe(picked)
      expect((await readStatus(directory)).clean).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("reports a cherry-pick conflict instead of hiding it", async () => {
    const directory = temporaryRepository("git-graph-conflict-")

    try {
      git(directory, ["init", "-b", "main"])
      writeFileSync(join(directory, "base.txt"), "base\n")
      git(directory, ["add", "base.txt"])
      git(directory, ["commit", "-m", "Base commit"])
      git(directory, ["checkout", "-b", "feature"])
      writeFileSync(join(directory, "base.txt"), "feature\n")
      git(directory, ["commit", "-am", "Feature change"])
      const featureHash = gitOut(directory, ["rev-parse", "HEAD"])
      git(directory, ["checkout", "main"])
      writeFileSync(join(directory, "base.txt"), "main\n")
      git(directory, ["commit", "-am", "Main change"])

      await expect(cherryPick(directory, featureHash)).rejects.toThrow()
      const status = await readStatus(directory)
      expect(status.inProgress).toBe("cherry-pick")
      expect(status.conflicted).toBeGreaterThan(0)
      expect(status.clean).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("reverts a commit with a new commit", async () => {
    const directory = temporaryRepository("git-graph-revert-")

    try {
      git(directory, ["init", "-b", "main"])
      writeFileSync(join(directory, "sample.txt"), "first\n")
      git(directory, ["add", "sample.txt"])
      git(directory, ["commit", "-m", "Initial commit"])
      writeFileSync(join(directory, "sample.txt"), "second\n")
      git(directory, ["commit", "-am", "Second commit"])
      const secondHash = gitOut(directory, ["rev-parse", "HEAD"])

      await revert(directory, secondHash)

      expect(gitOut(directory, ["log", "-1", "--format=%s"])).toContain("Revert")
      expect(gitOut(directory, ["show", "HEAD:sample.txt"])).toBe("first")
      expect((await readStatus(directory)).clean).toBe(true)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("resets soft, mixed, and hard with their documented effects", async () => {
    const directory = temporaryRepository("git-graph-reset-")

    try {
      git(directory, ["init", "-b", "main"])
      writeFileSync(join(directory, "sample.txt"), "first\n")
      git(directory, ["add", "sample.txt"])
      git(directory, ["commit", "-m", "Initial commit"])
      const firstHash = gitOut(directory, ["rev-parse", "HEAD"])
      writeFileSync(join(directory, "sample.txt"), "second\n")
      git(directory, ["commit", "-am", "Second commit"])

      await reset(directory, firstHash, "soft")
      expect(gitOut(directory, ["rev-parse", "HEAD"])).toBe(firstHash)
      expect((await readStatus(directory)).staged).toBe(1)

      await reset(directory, firstHash, "mixed")
      expect(gitOut(directory, ["rev-parse", "HEAD"])).toBe(firstHash)
      const mixed = await readStatus(directory)
      expect(mixed.staged).toBe(0)
      expect(mixed.unstaged).toBe(1)

      await reset(directory, firstHash, "hard")
      expect(gitOut(directory, ["rev-parse", "HEAD"])).toBe(firstHash)
      expect((await readStatus(directory)).clean).toBe(true)
      expect(gitOut(directory, ["show", "HEAD:sample.txt"])).toBe("first")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("pushes a branch to a configured remote and pulls a fast-forward", async () => {
    const root = temporaryRepository("git-graph-push-")
    const remote = join(root, "origin.git")
    const source = join(root, "source")
    const checkout = join(root, "checkout")
    mkdirSync(source)

    try {
      git(root, ["init", "--bare", "-b", "main", remote])
      git(source, ["init", "-b", "main"])
      writeFileSync(join(source, "sample.txt"), "first\n")
      git(source, ["add", "sample.txt"])
      git(source, ["commit", "-m", "Initial commit"])
      git(source, ["remote", "add", "origin", remote])
      git(source, ["push", "-u", "origin", "main"])
      execFileSync("git", ["clone", remote, checkout], { cwd: root, stdio: "ignore", env })

      expect(await readRemotes(checkout)).toEqual({ remotes: ["origin"] })

      writeFileSync(join(source, "sample.txt"), "second\n")
      git(source, ["commit", "-am", "Remote update"])
      git(source, ["push", "origin", "main"])

      await pull(checkout)
      expect(gitOut(checkout, ["rev-parse", "HEAD"])).toBe(gitOut(source, ["rev-parse", "HEAD"]))

      writeFileSync(join(checkout, "local.txt"), "local\n")
      git(checkout, ["add", "local.txt"])
      git(checkout, ["commit", "-m", "Local commit"])
      const localHash = gitOut(checkout, ["rev-parse", "HEAD"])

      await push(checkout, "origin", "main")
      expect(gitOut(remote, ["rev-parse", "refs/heads/main"])).toBe(localHash)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("rejects unknown remotes, branches, hashes, and reset modes", async () => {
    const directory = temporaryRepository("git-graph-validation-")

    try {
      git(directory, ["init", "-b", "main"])
      writeFileSync(join(directory, "sample.txt"), "first\n")
      git(directory, ["add", "sample.txt"])
      git(directory, ["commit", "-m", "Initial commit"])
      const hash = gitOut(directory, ["rev-parse", "HEAD"])

      await expect(checkoutBranch(directory, "missing")).rejects.toThrow()
      await expect(checkoutBranch(directory, "-dangerous")).rejects.toThrow()
      await expect(checkoutCommit(directory, "not-a-hash")).rejects.toThrow()
      await expect(cherryPick(directory, "HEAD~1")).rejects.toThrow()
      await expect(push(directory, "origin", "main")).rejects.toThrow("Unknown remote")
      await expect(
        reset(directory, hash, "invalid" as unknown as "soft"),
      ).rejects.toThrow("reset mode")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
