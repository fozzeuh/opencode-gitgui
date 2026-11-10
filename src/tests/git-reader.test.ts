import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  mergeCommitFiles,
  fetchAll,
  parseCommitFileStats,
  parseCommitFileStatus,
  parseGitBranches,
  parseGitLog,
  parseGitTags,
  readBranches,
  readBranchesContaining,
  readCommitFileDiff,
  readCommitFiles,
  readCommitPatch,
  readHistory,
  readTags,
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

describe("Git tag parsing", () => {
  it("uses the peeled commit for annotated tags and ignores non-commit tags", () => {
    const output = [
      `v1.0\0commit\0${firstHash}\0\0\0`,
      `v2.0\0tag\0${parentHash}\0commit\0${firstHash}\0`,
      `blob-tag\0blob\0${parentHash}\0\0\0`,
      "",
    ].join("\n")

    expect(parseGitTags(output)).toEqual([
      { name: "v1.0", hash: firstHash },
      { name: "v2.0", hash: firstHash },
    ])
  })

  it("ignores malformed tag records", () => {
    expect(parseGitTags(["v1\0commit\0not-a-hash\0\0\0", "\0\0\0\0\0"].join("\n"))).toEqual([])
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
  it("fetches updates from every configured remote when requested", async () => {
    const root = mkdtempSync(join(tmpdir(), "git-graph-fetch-"))
    const remote = join(root, "origin.git")
    const source = join(root, "source")
    const checkout = join(root, "checkout")
    mkdirSync(source)

    const git = (cwd: string, args: string[]) =>
      execFileSync("git", args, {
        cwd,
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
      git(root, ["init", "--bare", "-b", "main", remote])
      git(source, ["init", "-b", "main"])
      writeFileSync(join(source, "sample.txt"), "first\n")
      git(source, ["add", "sample.txt"])
      git(source, ["commit", "-m", "Initial commit"])
      git(source, ["remote", "add", "origin", remote])
      git(source, ["push", "-u", "origin", "main"])
      execFileSync("git", ["clone", remote, checkout], { cwd: root, stdio: "ignore" })

      writeFileSync(join(source, "sample.txt"), "second\n")
      git(source, ["commit", "-am", "Remote update"])
      git(source, ["push", "origin", "main"])

      const before = execFileSync("git", ["rev-parse", "refs/remotes/origin/main"], {
        cwd: checkout,
        encoding: "utf8",
      }).trim()
      await fetchAll(checkout)
      const after = execFileSync("git", ["rev-parse", "refs/remotes/origin/main"], {
        cwd: checkout,
        encoding: "utf8",
      }).trim()

      expect(after).not.toBe(before)
      expect(after).toBe(
        execFileSync("git", ["rev-parse", "main"], {
          cwd: source,
          encoding: "utf8",
        }).trim(),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

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
      const initialHash = allHistory.commits.at(-1)!.hash
      git(["tag", "v1.0", currentHash])
      git(["tag", "-a", "v0.1", "-m", "first release", initialHash])
      const tagInfo = await readTags(directory)
      const messageSearch = await readHistory(directory, 10, 0, undefined, { query: "Feature-only" })
      const hashSearch = await readHistory(directory, 10, 0, undefined, {
        query: featureHash.slice(0, 7),
      })
      const featureHistory = await readHistory(directory, 10, 0, undefined, { branch: "feature" })
      const remoteHistory = await readHistory(directory, 10, 0, undefined, { branch: "origin/main" })
      const containing = await readBranchesContaining(directory, featureHash)
      const featureFiles = await readCommitFiles(directory, featureHash)
      const mainFiles = await readCommitFiles(directory, currentHash)
      const featureDiff = await readCommitFileDiff(directory, featureHash, "feature.txt", null)
      const mainDiff = await readCommitFileDiff(directory, currentHash, "sample.txt", null)
      const initialDiff = await readCommitFileDiff(directory, initialHash, "sample.txt", null)

      expect(firstPage.root).toBe(realpathSync(directory))
      expect(firstPage.commits).toHaveLength(1)
      expect(firstPage.commits[0]?.hash).toBe(allHistory.commits[0]?.hash)
      expect(secondPage.commits[0]?.hash).toBe(allHistory.commits[1]?.hash)
      expect(allHistory.commits.map((commit) => commit.subject)).toContain("Feature-only commit")
      expect(branchInfo.current).toBe("main")
      expect(branchInfo.head).toBe(currentHash)
      expect(branchInfo.branches).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "main", current: true, remote: false }),
          expect.objectContaining({ name: "feature", remote: false }),
          expect.objectContaining({ name: "origin/main", remote: true }),
        ]),
      )
      expect(tagInfo.tags).toEqual(
        expect.arrayContaining([
          { name: "v1.0", hash: currentHash },
          { name: "v0.1", hash: initialHash },
        ]),
      )
      expect(messageSearch.commits.map((commit) => commit.hash)).toEqual([featureHash])
      expect(hashSearch.commits.map((commit) => commit.hash)).toEqual([featureHash])
      expect(featureHistory.commits.map((commit) => commit.subject)).toEqual([
        "Feature-only commit",
        "Second commit",
        "Initial commit",
      ])
      expect(remoteHistory.commits.map((commit) => commit.subject)).toEqual([
        "Second commit",
        "Initial commit",
      ])
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
      expect(featureDiff.binary).toBe(false)
      expect(featureDiff.truncated).toBe(false)
      expect(featureDiff.patch).toContain("+feature-only")
      expect(mainDiff.patch).toContain("-first")
      expect(mainDiff.patch).toContain("+second")
      expect(initialDiff.patch).toContain("+first")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("reports HEAD on a detached checkout and an unborn branch", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-head-"))
    const empty = mkdtempSync(join(tmpdir(), "git-graph-empty-"))
    const git = (cwd: string, args: string[]) =>
      execFileSync("git", args, {
        cwd,
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
      git(directory, ["init", "-b", "main"])
      writeFileSync(join(directory, "sample.txt"), "first\n")
      git(directory, ["add", "sample.txt"])
      git(directory, ["commit", "-m", "Initial commit"])
      const hash = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        encoding: "utf8",
      }).trim()
      git(directory, ["checkout", "--detach"])

      const detached = await readBranches(directory)

      expect(detached.current).toBeNull()
      expect(detached.head).toBe(hash)

      git(empty, ["init", "-b", "main"])
      const unborn = await readBranches(empty)

      expect(unborn.current).toBe("main")
      expect(unborn.head).toBeNull()
      expect(unborn.branches).toEqual([])
    } finally {
      rmSync(directory, { recursive: true, force: true })
      rmSync(empty, { recursive: true, force: true })
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

  it("reads the whole patch of a commit, including a root commit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-patch-"))
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
    const head = () =>
      execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim()

    try {
      git(["init", "-b", "main"])
      writeFileSync(join(directory, "a.txt"), "first a\n")
      writeFileSync(join(directory, "b.txt"), "first b\n")
      git(["add", "a.txt", "b.txt"])
      git(["commit", "-m", "Base commit"])
      const rootHash = head()

      const rootPatch = await readCommitPatch(directory, rootHash)
      expect(rootPatch.binary).toBe(false)
      expect(rootPatch.truncated).toBe(false)
      expect(rootPatch.patch).toContain("diff --git a/a.txt b/a.txt")
      expect(rootPatch.patch).toContain("diff --git a/b.txt b/b.txt")

      writeFileSync(join(directory, "a.txt"), "second a\n")
      writeFileSync(join(directory, "b.txt"), "second b\n")
      git(["commit", "-am", "Change both"])

      const patch = await readCommitPatch(directory, head())
      expect(patch.patch).toContain("diff --git a/a.txt b/a.txt")
      expect(patch.patch).toContain("diff --git a/b.txt b/b.txt")
      expect(patch.patch).toContain("+second a")
      expect(patch.patch).toContain("+second b")
      await expect(readCommitPatch(directory, "HEAD")).rejects.toThrow("hash is invalid")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("reads diffs for renamed and binary files", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-diff-"))
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
      writeFileSync(join(directory, "old.txt"), "content\n")
      git(["add", "old.txt"])
      git(["commit", "-m", "Base commit"])
      git(["mv", "old.txt", "new.txt"])
      writeFileSync(join(directory, "image.bin"), "bin\0data")
      git(["add", "image.bin"])
      git(["commit", "-m", "Rename and binary"])
      const hash = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        encoding: "utf8",
      }).trim()

      const renameDiff = await readCommitFileDiff(directory, hash, "new.txt", "old.txt")
      const binaryDiff = await readCommitFileDiff(directory, hash, "image.bin", null)

      expect(renameDiff.binary).toBe(false)
      expect(renameDiff.patch).toContain("rename from old.txt")
      expect(renameDiff.patch).toContain("rename to new.txt")
      expect(binaryDiff.binary).toBe(true)
      expect(binaryDiff.patch).toContain("Binary files")
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("reads an empty repository without failing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-empty-history-"))
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

      const history = await readHistory(directory, 300, 0)
      const branches = await readBranches(directory)
      const tags = await readTags(directory)

      expect(history.root).toBe(realpathSync(directory))
      expect(history.commits).toEqual([])
      expect(branches).toEqual({ current: "main", head: null, branches: [] })
      expect(tags.tags).toEqual([])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("keeps every parent of a multi-parent merge", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-octopus-"))
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
      git(["checkout", "-b", "one"])
      writeFileSync(join(directory, "one.txt"), "one\n")
      git(["add", "one.txt"])
      git(["commit", "-m", "One commit"])
      git(["checkout", "main"])
      git(["checkout", "-b", "two"])
      writeFileSync(join(directory, "two.txt"), "two\n")
      git(["add", "two.txt"])
      git(["commit", "-m", "Two commit"])
      git(["checkout", "main"])
      git(["merge", "--no-ff", "one", "two", "-m", "Octopus merge"])

      const mergeHash = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        encoding: "utf8",
      }).trim()
      const expectedParents = execFileSync("git", ["rev-list", "--parents", "-n", "1", mergeHash], {
        cwd: directory,
        encoding: "utf8",
      })
        .trim()
        .split(" ")
        .slice(1)

      const history = await readHistory(directory, 300, 0)
      const merge = history.commits.find((commit) => commit.hash === mergeHash)
      const files = await readCommitFiles(directory, mergeHash)

      expect(expectedParents).toHaveLength(3)
      expect(merge?.parents).toEqual(expectedParents)
      expect(history.commits.some((commit) => commit.subject === "Octopus merge")).toBe(true)
      expect(files.files.map((file) => file.path).sort()).toEqual(["one.txt", "two.txt"])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("keeps a commit reachable only from a tag after its branch is deleted", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-tagged-"))
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
      git(["checkout", "-b", "temporary"])
      writeFileSync(join(directory, "kept.txt"), "kept\n")
      git(["add", "kept.txt"])
      git(["commit", "-m", "Tagged commit"])
      const taggedHash = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        encoding: "utf8",
      }).trim()
      git(["tag", "keep", taggedHash])
      git(["checkout", "main"])
      git(["branch", "-D", "temporary"])

      const history = await readHistory(directory, 300, 0)
      const tags = await readTags(directory)
      const files = await readCommitFiles(directory, taggedHash)

      expect(history.commits.some((commit) => commit.hash === taggedHash)).toBe(true)
      expect(tags.tags).toEqual([{ name: "keep", hash: taggedHash }])
      expect(files.files.map((file) => file.path)).toEqual(["kept.txt"])
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("pages through a history larger than the page size", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-large-"))
    const total = 320
    const records: string[] = []

    for (let index = 1; index <= total; index += 1) {
      const message = `Commit ${index}`
      records.push(
        [
          "commit refs/heads/main",
          `mark :${index}`,
          `author Git Graph Test <git-graph@example.invalid> ${1_700_000_000 + index} +0000`,
          `committer Git Graph Test <git-graph@example.invalid> ${1_700_000_000 + index} +0000`,
          `data ${Buffer.byteLength(message)}`,
          message,
          ...(index > 1 ? [`from :${index - 1}`] : []),
          "",
        ].join("\n"),
      )
    }

    try {
      execFileSync("git", ["init", "-b", "main"], { cwd: directory, stdio: "ignore" })
      execFileSync("git", ["fast-import", "--quiet"], {
        cwd: directory,
        input: records.join("\n"),
        stdio: ["pipe", "ignore", "ignore"],
      })

      const first = await readHistory(directory, 300, 0)
      const second = await readHistory(directory, 100, 300)
      const clamped = await readHistory(directory, 10_000, 0)

      expect(first.commits).toHaveLength(300)
      expect(first.commits[0]?.subject).toBe(`Commit ${total}`)
      expect(first.commits[299]?.subject).toBe(`Commit ${total - 299}`)
      expect(second.commits).toHaveLength(total - 300)
      expect(second.commits[0]?.subject).toBe(`Commit ${total - 300}`)
      expect(clamped.commits).toHaveLength(300)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it("reports invalid input and Git failures instead of returning data", async () => {
    const directory = mkdtempSync(join(tmpdir(), "git-graph-failures-"))
    const missing = join(directory, "missing")
    const notRepository = mkdtempSync(join(tmpdir(), "git-graph-not-a-repo-"))

    try {
      execFileSync("git", ["init", "-b", "main"], { cwd: directory, stdio: "ignore" })

      await expect(readHistory(directory, 300, 0)).resolves.toMatchObject({ commits: [] })
      await expect(readHistory(notRepository, 300, 0)).rejects.toThrow()
      await expect(readHistory(missing, 300, 0)).rejects.toThrow()
      await expect(readHistory("relative/path", 300, 0)).rejects.toThrow("absolute")
      await expect(
        readHistory(directory, 300, 0, undefined, { query: "x".repeat(501) }),
      ).rejects.toThrow("too long")
      await expect(
        readHistory(directory, 300, 0, undefined, { query: "bad\nquery" }),
      ).rejects.toThrow("invalid characters")
      await expect(
        readHistory(directory, 300, 0, undefined, { branch: "-dangerous" }),
      ).rejects.toThrow("branch name")
      await expect(readCommitFiles(directory, "HEAD~1")).rejects.toThrow("hash is invalid")
      await expect(readCommitFileDiff(directory, "a".repeat(40), "bad\0path", null)).rejects.toThrow(
        "file path",
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
      rmSync(notRepository, { recursive: true, force: true })
    }
  })
})
