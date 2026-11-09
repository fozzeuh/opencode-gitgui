import { describe, expect, it } from "vitest"
import { highlightPatch, INITIAL_STATE, languageForPath, tokenize } from "../gui/highlight"

const TS_LANGUAGE = {
  lineComments: ["//"],
  blockComment: ["/*", "*/"] as const,
  quotes: ['"', "'", "`"],
  keywords: new Set(["const", "if", "return"]),
  types: new Set(["undefined"]),
}

function tokenizeTs(source: string) {
  return tokenize(source, TS_LANGUAGE)
}

describe("language detection", () => {
  it("maps common extensions", () => {
    expect(languageForPath("src/app.tsx")).toBe(languageForPath("lib/other.ts"))
    expect(languageForPath("script.py")).not.toBeNull()
    expect(languageForPath("styles/theme.scss")).not.toBeNull()
    expect(languageForPath("Cargo.toml")).not.toBeNull()
  })

  it("returns null for files that cannot be highlighted", () => {
    expect(languageForPath("README.md")).toBeNull()
    expect(languageForPath("Makefile")).toBeNull()
    expect(languageForPath(".gitignore")).toBeNull()
    expect(languageForPath("image.png")).toBeNull()
  })
})

describe("line tokenizer", () => {
  it("colors keywords, strings, and line comments", () => {
    const { tokens } = tokenizeTs(`const answer = "42" // life`)

    expect(tokens).toEqual([
      { text: "const", kind: "keyword" },
      { text: " answer = ", kind: "plain" },
      { text: `"42"`, kind: "string" },
      { text: " ", kind: "plain" },
      { text: "// life", kind: "comment" },
    ])
  })

  it("colors numbers, types, and function calls", () => {
    const { tokens } = tokenizeTs("if (compute(42) === undefined) return")
    const kinds = tokens.map((token) => [token.text, token.kind])

    expect(kinds).toContainEqual(["compute", "function"])
    expect(kinds).toContainEqual(["42", "number"])
    expect(kinds).toContainEqual(["undefined", "type"])
    expect(kinds).toContainEqual(["return", "keyword"])
  })

  it("keeps an escaped quote inside its string", () => {
    const { tokens } = tokenizeTs(`const s = "a\\"b" + c`)

    expect(tokens).toContainEqual({ text: `"a\\"b"`, kind: "string" })
  })

  it("carries an open block comment to the next line", () => {
    const first = tokenizeTs("/* still open")

    expect(first.state.blockComment).toBe(true)
    expect(first.tokens).toEqual([{ text: "/* still open", kind: "comment" }])

    const second = tokenize("closed */ const x = 1", TS_LANGUAGE, first.state)
    expect(second.state.blockComment).toBe(false)
    expect(second.tokens[0]).toEqual({ text: "closed */", kind: "comment" })
    expect(second.tokens).toContainEqual({ text: "const", kind: "keyword" })
  })
})

describe("diff highlighting", () => {
  const patch = [
    "diff --git a/src/a.ts b/src/a.ts",
    "index 111..222 100644",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,2 +1,3 @@",
    " const kept = 1",
    "-const removed = 2",
    "+const added = 3",
    "+// note",
    "\\ No newline at end of file",
  ].join("\n")

  it("classifies metadata, hunks, additions, deletions, and context", () => {
    const lines = highlightPatch(patch, "src/a.ts")

    expect(lines.map((line) => line.kind)).toEqual([
      "meta",
      "meta",
      "meta",
      "meta",
      "hunk",
      "context",
      "remove",
      "add",
      "add",
      "meta",
    ])
  })

  it("preserves every character of the patch", () => {
    const lines = highlightPatch(patch, "src/a.ts")

    expect(lines.map((line) => `${line.prefix}${line.tokens.map((token) => token.text).join("")}`)).toEqual(
      patch.split("\n"),
    )
  })

  it("tokenizes code after the diff marker", () => {
    const line = highlightPatch(patch, "src/a.ts").find(
      (entry) => entry.kind === "add" && entry.tokens.length > 2,
    )

    expect(line?.prefix).toBe("+")
    expect(line?.tokens[0]).toEqual({ text: "const", kind: "keyword" })
  })

  it("treats a removed line starting with `-- ` as a deletion inside a hunk", () => {
    const lines = highlightPatch("@@ -1 +1 @@\n--- old\n+++ new", "src/a.sql")

    expect(lines[1]).toMatchObject({ kind: "remove", prefix: "-" })
    expect(lines[2]).toMatchObject({ kind: "add", prefix: "+" })
  })

  it("falls back to plain text for unknown languages", () => {
    const lines = highlightPatch("+const answer = 42", "README.md")

    expect(lines[0]).toEqual({
      kind: "add",
      prefix: "+",
      tokens: [{ text: "const answer = 42", kind: "plain" }],
    })
  })

  it("returns no lines for an empty patch", () => {
    expect(highlightPatch("", "src/a.ts")).toEqual([])
  })

  it("resets block-comment state at a hunk header", () => {
    const lines = highlightPatch("@@ -1 +1 @@\n/* open\n@@ -10 +10 @@\n const x = 1", "src/a.ts")

    expect(lines.at(-1)?.tokens[0]).toEqual({ text: "const", kind: "keyword" })
  })
})

it("exposes an initial tokenizer state", () => {
  expect(INITIAL_STATE).toEqual({ blockComment: false })
})
