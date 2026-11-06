import { describe, expect, it } from "vitest"
import type { GitBranch } from "../git/reader"
import { combineBranchRefs, countLogicalBranches } from "../shared/branches"

const branch = (name: string, hash: string, remote = false): GitBranch => ({
  name,
  hash,
  remote,
  current: false,
})

describe("logical branch count", () => {
  it("counts an identical local and origin branch once and ignores remote HEAD", () => {
    const refs = [
      branch("main", "a".repeat(40)),
      branch("origin/main", "a".repeat(40), true),
      branch("origin/HEAD", "a".repeat(40), true),
    ]

    expect(countLogicalBranches(refs)).toBe(1)
    expect(combineBranchRefs(refs)).toEqual([
      {
        name: "main",
        hash: "a".repeat(40),
        current: false,
        remotes: ["origin/main"],
      },
    ])
  })

  it("counts branches with the same name separately when their tips differ", () => {
    expect(
      countLogicalBranches([
        branch("main", "a".repeat(40)),
        branch("origin/main", "b".repeat(40), true),
      ]),
    ).toBe(2)
    expect(combineBranchRefs([
      branch("main", "a".repeat(40)),
      branch("origin/main", "b".repeat(40), true),
    ]).map((item) => item.name)).toEqual(["main", "origin/main"])
  })

  it("keeps differently named branches separate even when their tips match", () => {
    expect(
      countLogicalBranches([
        branch("main", "a".repeat(40)),
        branch("release", "a".repeat(40)),
      ]),
    ).toBe(2)
  })
})
