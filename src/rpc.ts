import { Rpc } from "@opencode/plugin/rpc"
import { Schema } from "effect"

/** The typed contract between the server-side Git reader and the GUI. */
const RepositoryInput = Schema.Struct({
  directory: Schema.String,
})

const Commit = Schema.Struct({
  hash: Schema.String,
  parents: Schema.Array(Schema.String),
  author: Schema.String,
  timestamp: Schema.Number,
  subject: Schema.String,
  decorations: Schema.String,
})

const Branch = Schema.Struct({
  name: Schema.String,
  hash: Schema.String,
  remote: Schema.Boolean,
  current: Schema.Boolean,
})

const Tag = Schema.Struct({
  name: Schema.String,
  hash: Schema.String,
})

const FileChange = Schema.Struct({
  path: Schema.String,
  previousPath: Schema.NullOr(Schema.String),
  status: Schema.Literals([
    "added",
    "modified",
    "deleted",
    "renamed",
    "copied",
    "type-changed",
    "unknown",
  ]),
  additions: Schema.NullOr(Schema.Number),
  deletions: Schema.NullOr(Schema.Number),
  binary: Schema.Boolean,
})

const FileDiff = Schema.Struct({
  patch: Schema.String,
  binary: Schema.Boolean,
  truncated: Schema.Boolean,
})

const Status = Schema.Struct({
  clean: Schema.Boolean,
  branch: Schema.NullOr(Schema.String),
  head: Schema.NullOr(Schema.String),
  staged: Schema.Number,
  unstaged: Schema.Number,
  untracked: Schema.Number,
  conflicted: Schema.Number,
  inProgress: Schema.NullOr(
    Schema.Literals(["merge", "cherry-pick", "revert", "rebase"]),
  ),
})

const ActionInput = Schema.Struct({
  directory: Schema.String,
  hash: Schema.String,
})

const ActionOutput = Schema.Struct({ ok: Schema.Boolean })

export const GitGraphRpc = Rpc.define({
  id: "git-graph",
  methods: {
    ping: {
      input: Schema.toStandardSchemaV1(Schema.Struct({})),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({
          ok: Schema.Boolean,
          version: Schema.String,
          directory: Schema.NullOr(Schema.String),
        }),
      ),
    },
    history: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({
          directory: Schema.String,
          limit: Schema.Number,
          offset: Schema.Number,
          query: Schema.optional(Schema.String),
          branch: Schema.optional(Schema.NullOr(Schema.String)),
        }),
      ),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({
          root: Schema.String,
          commits: Schema.Array(Commit),
        }),
      ),
    },
    branches: {
      input: Schema.toStandardSchemaV1(RepositoryInput),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({
          current: Schema.NullOr(Schema.String),
          head: Schema.NullOr(Schema.String),
          branches: Schema.Array(Branch),
        }),
      ),
    },
    tags: {
      input: Schema.toStandardSchemaV1(RepositoryInput),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({
          tags: Schema.Array(Tag),
        }),
      ),
    },
    fetchAll: {
      input: Schema.toStandardSchemaV1(RepositoryInput),
      output: Schema.toStandardSchemaV1(Schema.Struct({ ok: Schema.Boolean })),
    },
    branchesContaining: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ directory: Schema.String, hash: Schema.String }),
      ),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({ branches: Schema.Array(Branch) }),
      ),
    },
    commitFiles: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ directory: Schema.String, hash: Schema.String }),
      ),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({
          files: Schema.Array(FileChange),
          truncated: Schema.Boolean,
        }),
      ),
    },
    commitFileDiff: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({
          directory: Schema.String,
          hash: Schema.String,
          path: Schema.String,
          previousPath: Schema.NullOr(Schema.String),
        }),
      ),
      output: Schema.toStandardSchemaV1(FileDiff),
    },
    status: {
      input: Schema.toStandardSchemaV1(RepositoryInput),
      output: Schema.toStandardSchemaV1(Status),
    },
    remotes: {
      input: Schema.toStandardSchemaV1(RepositoryInput),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({ remotes: Schema.Array(Schema.String) }),
      ),
    },
    checkoutBranch: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ directory: Schema.String, branch: Schema.String }),
      ),
      output: Schema.toStandardSchemaV1(ActionOutput),
    },
    checkoutCommit: {
      input: Schema.toStandardSchemaV1(ActionInput),
      output: Schema.toStandardSchemaV1(ActionOutput),
    },
    cherryPick: {
      input: Schema.toStandardSchemaV1(ActionInput),
      output: Schema.toStandardSchemaV1(ActionOutput),
    },
    revert: {
      input: Schema.toStandardSchemaV1(ActionInput),
      output: Schema.toStandardSchemaV1(ActionOutput),
    },
    reset: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({
          directory: Schema.String,
          hash: Schema.String,
          mode: Schema.Literals(["soft", "mixed", "hard"]),
        }),
      ),
      output: Schema.toStandardSchemaV1(ActionOutput),
    },
    push: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({
          directory: Schema.String,
          remote: Schema.String,
          branch: Schema.String,
        }),
      ),
      output: Schema.toStandardSchemaV1(ActionOutput),
    },
    pull: {
      input: Schema.toStandardSchemaV1(RepositoryInput),
      output: Schema.toStandardSchemaV1(ActionOutput),
    },
  },
  events: {},
})
