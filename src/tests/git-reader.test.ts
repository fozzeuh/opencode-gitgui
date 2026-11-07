import { execFileSync } from "node:child_process"
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  mergeCommitFiles,
  parseCommitFileStats,
  parseCommitFileStatus,
  parseGitBranches,
  parseGitLog,
  readBranches,
  readBranchesContaining,
  readCommitFiles,
  readHistory,
} from "../git/reader"

const firstHash = "a".repeat(40)
const parentHash = "b".repeat(40)

describe("Git log parsing", () => {
  it("parses commits, parents, metadata, and decorations", () => {
    const output =
      [firstHash, parentHash, "Ada Lovelace", "1700000000", "Add graph", "HEAD -> main, origin/main"].join("\0") +
      "\x1e\n"

    expect(parseGitLog(output)).toEqual([
      {
        hash: firstHash,
        parents: [parentHash],
        author: "Ada Lovelace",
        timestamp: 1_700_000_000,
        subject: "Add graph",
        decorations: "HEAD -> main, origin/main",
      },
    ])
  })

  it("supports root commits with no parents", () => {
    expect(parseGitLog([firstHash, "", "Lin", "1", "Initial", ""].join("\0") + "\x1e")[0]?.parents).toEqual([])
  })

  it("rejects malformed commit records", () => {
    expect(() => parseGitLog(["not-a-hash", "", "Author", "1", "Subject", ""].join("\0") + "\x1e")).toThrow(
      "invalid commit record",
    )
  })
})

describe("Git branch parsing", () => {
  it("distinguishes local and remote refs and marks the checked-out branch", () => {
    const output = [
      `refs/heads/main\0${firstHash}\0*\0`,
      `refs/remotes/origin/main\0${parentHash}\0\0`,
    ].join("\n")

    expect(parseGitBranches(output)).toEqual([
      { name: "main", hash: firstHash, remote: false, current: true },
      { name: "origin/main", hash: parentHash, remote: true, current: false },
    ])
  })
})

describe("Commit file parsing", () => {
  it("parses modified, renamed, added, and binary files", () => {
    const statuses = parseCommitFileStatus(
      ["M", "src/a.ts", "R100", "old.ts", "new.ts", "A", "img.bin", ""].join("\0"),
    )
    const stats = parseCommitFileStats(
      ["2\t1\tsrc/a.ts", "0\t0\t", "old.ts", "new.ts", "-\t-\timg.bin", ""].join("\0"),
    )

    expect(mergeCommitFiles(statuses, stats)).toEqual([
      {
        path: "src/a.ts",
        previousPath: null,
        status: "modified",
        additions: 2,
        deletions: 1,
        binary: false,
      },
      {
        path: "new.ts",
        previousPath: "old.ts",
        status: "renamed",
        additions: 0,
        deletions: 0,
        binary: false,
      },
      {
        path: "img.bin",
        previousPath: null,
        status: "added",
        additions: null,
        deletions: null,
        binary: true,
      },
    ])
  })

  it("rejects malformed file records", () => {
    expect(() => parseCommitFileStatus(["M", ""].join("\0"))).toThrow("invalid file status record")
    expect(() => parseCommitFileStatus(["R100", "old.ts", ""].join("\0"))).toThrow(
      "invalid file status record",
    )
    expect(() => parseCommitFileStats("not-a-stat\0")).toThrow("invalid file stats record")
  })
})

describe("Git reader integration", () => {
  it("reads paginated history and local/remote branches from a real repository", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-reader-"))
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: directory,
        stdio: "ignore",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Git Graph Test",
          GIT_AUTHOR_EMAIL: "git-graph@example.invalid",
          GIT_COMMITTER_NAME: "Git Graph Test",
          GIT_COMMITTER_EMAIL: "git-graph@example.invalid",
        },
      })

    try {
      git(["init", "-b", "main"])
      writeFileSync(join(directory, "sample.txt"), "first\n")
      git(["add", "sample.txt"])
      git(["commit", "-m", "Initial commit"])
      writeFileSync(join(directory, "sample.txt"), "second\n")
      git(["commit", "-am", "Second commit"])
      git(["checkout", "-b", "feature"])
      writeFileSync(join(directory, "feature.txt"), "feature-only\n")
      git(["add", "feature.txt"])
      git(["commit", "-m", "Feature-only commit"])
      const featureHash = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim()
      git(["checkout", "main"])
      const currentHash = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim()
      git(["update-ref", "refs/remotes/origin/main", currentHash])

      const allHistory = await readHistory(directory, 10, 0)
      const firstPage = await readHistory(directory, 1, 0)
      const secondPage = await readHistory(directory, 1, 1)
      const branchInfo = await readBranches(directory)
      const containing = await readBranchesContaining(directory, featureHash)
      const featureFiles = await readCommitFiles(directory, featureHash)
      const mainFiles = await readCommitFiles(directory, currentHash)

      expect(firstPage.root).toBe(realpathSync(directory))
      expect(firstPage.commits).toHaveLength(1)
      expect(firstPage.commits[0]?.hash).toBe(allHistory.commits[0]?.hash)
      expect(secondPage.commits[0]?.hash).toBe(allHistory.commits[1]?.hash)
      expect(allHistory.commits.map((commit) => commit.subject)).toContain("Feature-only commit")
      expect(branchInfo.current).toBe("main")
      expect(branchInfo.branches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "main", current: true, remote: false }),
          expect.objectContaining({ name: "feature", remote: false }),
          expect.objectContaining({ name: "origin/main", remote: true }),
        ]),
      )
      expect(containing.branches.map((branch) => branch.name)).toEqual(["feature"])
      expect(featureFiles.files).toEqual([
        {
          path: "feature.txt",
          previousPath: null,
          status: "added",
          additions: 1,
          deletions: 0,
          binary: false,
        },
      ])
      expect(featureFiles.truncated).toBe(false)
      expect(mainFiles.files).toEqual([
        {
          path: "sample.txt",
          previousPath: null,
          status: "modified",
          additions: 1,
          deletions: 1,
          binary: false,
        },
      ])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("reads files changed by a merge against its first parent", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-merge-"))
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: directory,
        stdio: "ignore",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "Git Graph Test",
          GIT_AUTHOR_EMAIL: "git-graph@example.invalid",
          GIT_COMMITTER_NAME: "Git Graph Test",
          GIT_COMMITTER_EMAIL: "git-graph@example.invalid",
        },
      })

    try {
      git(["init", "-b", "main"])
      writeFileSync(join(directory, "base.txt"), "base\n")
      git(["add", "base.txt"])
      git(["commit", "-m", "Base commit"])
      git(["checkout", "-b", "feature"])
      writeFileSync(join(directory, "feature.txt"), "feature\n")
      git(["add", "feature.txt"])
      git(["commit", "-m", "Feature commit"])
      git(["checkout", "main"])
      writeFileSync(join(directory, "main.txt"), "main\n")
      git(["add", "main.txt"])
      git(["commit", "-m", "Main commit"])
      git(["merge", "--no-ff", "feature", "-m", "Merge feature"])
      const mergeHash = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        encoding: "utf8",
      }).trim()

      const mergeFiles = await readCommitFiles(directory, mergeHash)

      expect(mergeFiles.files).toEqual([
        {
          path: "feature.txt",
          previousPath: null,
          status: "added",
          additions: 1,
          deletions: 0,
          binary: false,
        },
      ])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
