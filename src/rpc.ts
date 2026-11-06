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
          branches: Schema.Array(Branch),
        }),
      ),
    },
    branchesContaining: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({ directory: Schema.String, hash: Schema.String }),
      ),
      output: Schema.toStandardSchemaV1(
        Schema.Struct({ branches: Schema.Array(Branch) }),
      ),
    },
  },
  events: {},
})
