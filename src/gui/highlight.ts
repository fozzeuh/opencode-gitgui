/**
 * Small, dependency-free syntax highlighter for unified diffs.
 *
 * The GUI receives a single patch per file, so a full parser is unnecessary.
 * A line-oriented tokenizer is enough to color comments, strings, numbers,
 * keywords, types, and function calls. It keeps the input text untouched: the
 * concatenation of a line's prefix and tokens always equals the original line.
 */

export type TokenKind = "plain" | "comment" | "string" | "number" | "keyword" | "type" | "function"

export interface Token {
  readonly text: string
  readonly kind: TokenKind
}

export type DiffLineKind = "meta" | "hunk" | "add" | "remove" | "context"

export interface HighlightedLine {
  readonly kind: DiffLineKind
  /** Diff marker (`+`, `-`, or a space); empty for metadata and hunk headers. */
  readonly prefix: string
  readonly tokens: readonly Token[]
}

export interface TokenizerState {
  readonly blockComment: boolean
}

export const INITIAL_STATE: TokenizerState = { blockComment: false }

export interface Language {
  readonly lineComments: readonly string[]
  readonly blockComment?: readonly [start: string, end: string]
  readonly quotes: readonly string[]
  readonly keywords: ReadonlySet<string>
  readonly types: ReadonlySet<string>
}

const words = (source: string): ReadonlySet<string> =>
  new Set(source.split(/\s+/).filter((word) => word.length > 0))

const COMMON_TYPES = words(
  "any bigint boolean false never null number object string symbol true undefined unknown void",
)

const JS_KEYWORDS = words(`
  abstract as asserts async await break case catch class const continue debugger declare default
  delete do else enum export extends finally for from function get if implements import in infer
  instanceof interface is keyof let module namespace new of override private protected public
  readonly require return satisfies set static super switch this throw try type typeof var while
  with yield
`)

const C_FAMILY_KEYWORDS = words(`
  abstract assert boolean break byte case catch char class const continue default delete do double
  else enum extends final finally float for foreach goto if implements import instanceof int
  interface long native new package private protected public return short signed sizeof static
  strictfp super switch synchronized this throw throws transient try typeof unsigned virtual void
  volatile while yield
`)

const C_FAMILY_TYPES = words(`
  bool char double float int long short signed size_t string String uint unsigned void
  int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t
`)

const PYTHON_KEYWORDS = words(`
  and as assert async await break case class continue def del elif else except finally for from
  global if import in is lambda match nonlocal not or pass raise return try while with yield
`)

const PYTHON_TYPES = words("bool bytes dict float frozenset int list object set str tuple None True False")

const SHELL_KEYWORDS = words(`
  alias break case continue coproc declare do done elif else esac export fi for function if in
  local readonly return select shift source then time typeset unset until while
`)

const RUST_KEYWORDS = words(`
  as async await break const continue crate dyn else enum extern false fn for if impl in let loop
  match mod move mut pub ref return self Self static struct super trait true type unsafe use where
  while
`)

const RUST_TYPES = words(`
  bool char f32 f64 i8 i16 i32 i64 i128 isize str u8 u16 u32 u64 u128 usize
  Box Option Result String Vec
`)

const GO_KEYWORDS = words(`
  break case chan const continue default defer else fallthrough for func go goto if import
  interface map package range return select struct switch type var
`)

const GO_TYPES = words(`
  any bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string
  uint uint8 uint16 uint32 uint64 uintptr
`)

const RUBY_KEYWORDS = words(`
  alias and begin break case class def defined do else elsif end ensure false for if in module next
  nil not or redo rescue retry return self super then true undef unless until when while yield
  attr_accessor attr_reader attr_writer require
`)

const RUBY_TYPES = words("Array FalseClass Float Hash Integer NilClass Object String Symbol TrueClass")

const PHP_KEYWORDS = words(`
  abstract and array as break callable case catch class clone const continue declare default do
  echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile eval exit extends
  final finally fn for foreach function global goto if implements include include_once instanceof
  insteadof interface isset list match namespace new or print private protected public readonly
  require require_once return static switch throw trait try unset use var while xor yield
`)

const PHP_TYPES = words("array bool false float int mixed never null object self static string true void")

const SWIFT_KEYWORDS = words(`
  as associatedtype break case catch class continue default defer deinit do else enum extension
  fallthrough false fileprivate for func guard if import in init inout internal is let nil open
  operator private protocol public repeat rethrows return self Self static struct subscript super
  switch throw throws true try typealias var where while
`)

const SWIFT_TYPES = words(`
  Any Array Bool Character Dictionary Double Float Int Optional Set String Void
`)

const KOTLIN_KEYWORDS = words(`
  actual abstract annotation as break by catch class companion const constructor continue crossinline
  data delegate do dynamic else enum expect external false field file final finally for fun get if
  import in infix init inline inner interface internal is lateinit noinline null object open operator
  out override package param private property protected public receiver reified return sealed set
  setparam super suspend tailrec this throw true try typealias typeof val var vararg when where while
`)

const KOTLIN_TYPES = words(`
  Any Array Boolean Byte Char Double Float Int List Long Map Nothing Set Short String Unit
`)

const SQL_KEYWORDS = words(`
  add all alter and as between by case column create delete distinct drop else end exists foreign
  from group having in inner insert into is join key left like limit not null offset on or order
  outer primary references right select set table then union update values when where
`)

const SQL_TYPES = words("boolean char date decimal integer numeric real text timestamp varchar")

const LUA_KEYWORDS = words(`
  and break do else elseif end false for function goto if in local nil not or repeat return then
  true until while
`)

const LUA_TYPES = words("boolean function nil number string table")

const JSON_SPEC: Language = {
  lineComments: [],
  quotes: ['"'],
  keywords: words("false null true"),
  types: new Set(),
}

const CSS_SPEC: Language = {
  lineComments: [],
  blockComment: ["/*", "*/"],
  quotes: ['"', "'"],
  keywords: new Set(),
  types: new Set(),
}

export const LANGUAGES = {
  javascript: {
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    quotes: ['"', "'", "`"],
    keywords: JS_KEYWORDS,
    types: COMMON_TYPES,
  },
  typescript: {
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    quotes: ['"', "'", "`"],
    keywords: JS_KEYWORDS,
    types: COMMON_TYPES,
  },
  json: JSON_SPEC,
  css: CSS_SPEC,
  markup: {
    lineComments: [],
    blockComment: ["<!--", "-->"],
    quotes: ['"', "'"],
    keywords: new Set(),
    types: new Set(),
  },
  shell: {
    lineComments: ["#"],
    quotes: ['"', "'", "`"],
    keywords: SHELL_KEYWORDS,
    types: words("false true"),
  },
  python: {
    lineComments: ["#"],
    quotes: ['"', "'"],
    keywords: PYTHON_KEYWORDS,
    types: PYTHON_TYPES,
  },
  ruby: {
    lineComments: ["#"],
    quotes: ['"', "'"],
    keywords: RUBY_KEYWORDS,
    types: RUBY_TYPES,
  },
  go: {
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    quotes: ['"', "'", "`"],
    keywords: GO_KEYWORDS,
    types: GO_TYPES,
  },
  rust: {
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    quotes: ['"'],
    keywords: RUST_KEYWORDS,
    types: RUST_TYPES,
  },
  c: {
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    quotes: ['"', "'"],
    keywords: C_FAMILY_KEYWORDS,
    types: C_FAMILY_TYPES,
  },
  php: {
    lineComments: ["//", "#"],
    blockComment: ["/*", "*/"],
    quotes: ['"', "'"],
    keywords: PHP_KEYWORDS,
    types: PHP_TYPES,
  },
  swift: {
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    quotes: ['"'],
    keywords: SWIFT_KEYWORDS,
    types: SWIFT_TYPES,
  },
  kotlin: {
    lineComments: ["//"],
    blockComment: ["/*", "*/"],
    quotes: ['"', "'"],
    keywords: KOTLIN_KEYWORDS,
    types: KOTLIN_TYPES,
  },
  sql: {
    lineComments: ["--"],
    blockComment: ["/*", "*/"],
    quotes: ["'"],
    keywords: SQL_KEYWORDS,
    types: SQL_TYPES,
  },
  lua: {
    lineComments: ["--"],
    quotes: ['"', "'"],
    keywords: LUA_KEYWORDS,
    types: LUA_TYPES,
  },
  yaml: {
    lineComments: ["#"],
    quotes: ['"', "'"],
    keywords: words("false null off on true yes"),
    types: new Set(),
  },
  toml: {
    lineComments: ["#"],
    quotes: ['"', "'"],
    keywords: words("false true"),
    types: new Set(),
  },
} satisfies Record<string, Language>

const EXTENSIONS: Record<string, Language> = {
  ts: LANGUAGES.typescript,
  tsx: LANGUAGES.typescript,
  mts: LANGUAGES.typescript,
  cts: LANGUAGES.typescript,
  js: LANGUAGES.javascript,
  jsx: LANGUAGES.javascript,
  mjs: LANGUAGES.javascript,
  cjs: LANGUAGES.javascript,
  json: LANGUAGES.json,
  jsonc: LANGUAGES.json,
  css: LANGUAGES.css,
  scss: LANGUAGES.css,
  less: LANGUAGES.css,
  html: LANGUAGES.markup,
  htm: LANGUAGES.markup,
  vue: LANGUAGES.markup,
  svelte: LANGUAGES.markup,
  xml: LANGUAGES.markup,
  svg: LANGUAGES.markup,
  sh: LANGUAGES.shell,
  bash: LANGUAGES.shell,
  zsh: LANGUAGES.shell,
  py: LANGUAGES.python,
  pyi: LANGUAGES.python,
  rb: LANGUAGES.ruby,
  go: LANGUAGES.go,
  rs: LANGUAGES.rust,
  c: LANGUAGES.c,
  h: LANGUAGES.c,
  cc: LANGUAGES.c,
  cpp: LANGUAGES.c,
  cxx: LANGUAGES.c,
  hpp: LANGUAGES.c,
  hh: LANGUAGES.c,
  java: LANGUAGES.c,
  cs: LANGUAGES.c,
  php: LANGUAGES.php,
  swift: LANGUAGES.swift,
  kt: LANGUAGES.kotlin,
  kts: LANGUAGES.kotlin,
  sql: LANGUAGES.sql,
  lua: LANGUAGES.lua,
  yml: LANGUAGES.yaml,
  yaml: LANGUAGES.yaml,
  toml: LANGUAGES.toml,
}

/** Resolve a language from a repository-relative file path. */
export function languageForPath(path: string): Language | null {
  const name = path.slice(path.lastIndexOf("/") + 1)
  const dot = name.lastIndexOf(".")
  if (dot < 0 || dot === name.length - 1) return null
  return EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? null
}

const IDENTIFIER_START = /[A-Za-z_$]/
const IDENTIFIER_PART = /[A-Za-z0-9_$]/
const DIGIT = /[0-9]/
const WHITESPACE = /\s/

function pushes(tokens: Token[], text: string, kind: TokenKind): void {
  if (text.length === 0) return
  const last = tokens.at(-1)
  if (last?.kind === kind) {
    tokens[tokens.length - 1] = { text: last.text + text, kind }
    return
  }
  tokens.push({ text, kind })
}

function startsToken(source: string, index: number, language: Language): boolean {
  const char = source[index]
  if (char === undefined) return false
  if (WHITESPACE.test(char) || DIGIT.test(char) || IDENTIFIER_START.test(char)) return true
  if (language.quotes.includes(char)) return true
  if (language.lineComments.some((marker) => source.startsWith(marker, index))) return true
  return language.blockComment !== undefined && source.startsWith(language.blockComment[0], index)
}

function identifierKind(word: string, source: string, end: number, language: Language): TokenKind {
  if (language.types.has(word)) return "type"
  if (language.keywords.has(word)) return "keyword"
  let next = end
  while (next < source.length && WHITESPACE.test(source[next] ?? "")) next += 1
  return source[next] === "(" ? "function" : "plain"
}

export interface TokenizeResult {
  readonly tokens: readonly Token[]
  readonly state: TokenizerState
}

/**
 * Tokenize one line of source. Block-comment state carries over so a comment
 * that spans several diff lines stays colored.
 */
export function tokenize(
  source: string,
  language: Language,
  state: TokenizerState = INITIAL_STATE,
): TokenizeResult {
  const tokens: Token[] = []
  let index = 0
  let blockComment = state.blockComment

  while (index < source.length) {
    if (blockComment) {
      const close = language.blockComment?.[1]
      const end = close === undefined ? -1 : source.indexOf(close, index)
      if (end < 0) {
        pushes(tokens, source.slice(index), "comment")
        break
      }
      const stop = end + (close?.length ?? 0)
      pushes(tokens, source.slice(index, stop), "comment")
      index = stop
      blockComment = false
      continue
    }

    const lineComment = language.lineComments.find((marker) => source.startsWith(marker, index))
    if (lineComment !== undefined) {
      pushes(tokens, source.slice(index), "comment")
      break
    }

    if (language.blockComment !== undefined && source.startsWith(language.blockComment[0], index)) {
      const [open, close] = language.blockComment
      const end = source.indexOf(close, index + open.length)
      if (end < 0) {
        pushes(tokens, source.slice(index), "comment")
        blockComment = true
        break
      }
      const stop = end + close.length
      pushes(tokens, source.slice(index, stop), "comment")
      index = stop
      continue
    }

    const char = source[index] ?? ""

    if (WHITESPACE.test(char)) {
      let end = index + 1
      while (end < source.length && WHITESPACE.test(source[end] ?? "")) end += 1
      pushes(tokens, source.slice(index, end), "plain")
      index = end
      continue
    }

    if (language.quotes.includes(char)) {
      let end = index + 1
      while (end < source.length) {
        const current = source[end]
        if (current === "\\") {
          end += 2
          continue
        }
        end += 1
        if (current === char) break
      }
      pushes(tokens, source.slice(index, Math.min(end, source.length)), "string")
      index = Math.min(end, source.length)
      continue
    }

    if (DIGIT.test(char)) {
      let end = index + 1
      while (end < source.length) {
        const current = source[end] ?? ""
        if (/[A-Za-z0-9_.]/.test(current)) {
          end += 1
          continue
        }
        const previous = source[end - 1] ?? ""
        if ((current === "+" || current === "-") && (previous === "e" || previous === "E")) {
          end += 1
          continue
        }
        break
      }
      pushes(tokens, source.slice(index, end), "number")
      index = end
      continue
    }

    if (IDENTIFIER_START.test(char)) {
      let end = index + 1
      while (end < source.length && IDENTIFIER_PART.test(source[end] ?? "")) end += 1
      const word = source.slice(index, end)
      pushes(tokens, word, identifierKind(word, source, end, language))
      index = end
      continue
    }

    let end = index + 1
    while (end < source.length && !startsToken(source, end, language)) end += 1
    pushes(tokens, source.slice(index, end), "plain")
    index = end
  }

  return { tokens, state: { blockComment } }
}

const META_PREFIXES = [
  "diff --git",
  "index ",
  "new file mode",
  "deleted file mode",
  "old mode",
  "new mode",
  "similarity index",
  "dissimilarity index",
  "rename from",
  "rename to",
  "copy from",
  "copy to",
  "\\ No newline",
]

/**
 * `--- ` and `+++ ` are file headers before the first hunk, but a removed line
 * whose content starts with `-- ` or an added line starting with `++ ` has the
 * same prefix. Hunk position disambiguates them.
 */
function classify(line: string, seenHunk: boolean): DiffLineKind {
  if (line.startsWith("@@")) return "hunk"
  if (META_PREFIXES.some((prefix) => line.startsWith(prefix))) return "meta"
  if (!seenHunk && (line.startsWith("--- ") || line.startsWith("+++ "))) return "meta"
  if (line.startsWith("+")) return "add"
  if (line.startsWith("-")) return "remove"
  return "context"
}

/**
 * Split a unified patch into highlighted lines. Metadata and hunk headers keep
 * their text untouched; code lines are tokenized using the file's language.
 */
export function highlightPatch(patch: string, path: string): readonly HighlightedLine[] {
  const language = languageForPath(path)
  const normalized = patch.replace(/\n$/, "")
  const lines = normalized.length === 0 ? [] : normalized.split("\n")
  const result: HighlightedLine[] = []
  let state = INITIAL_STATE
  let seenHunk = false

  for (const line of lines) {
    const kind = classify(line, seenHunk)
    if (kind === "hunk") seenHunk = true
    if (kind === "meta" || kind === "hunk") {
      state = INITIAL_STATE
      result.push({ kind, prefix: "", tokens: line.length > 0 ? [{ text: line, kind: "plain" }] : [] })
      continue
    }

    const prefix = line.slice(0, 1)
    const content = line.slice(prefix.length)
    if (language === null) {
      result.push({ kind, prefix, tokens: content.length > 0 ? [{ text: content, kind: "plain" }] : [] })
      continue
    }

    const tokenized = tokenize(content, language, state)
    state = tokenized.state
    result.push({ kind, prefix, tokens: tokenized.tokens })
  }

  return result
}
