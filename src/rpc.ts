import { Rpc } from "@opencode/plugin/rpc"
import { Schema } from "effect"

/**
 * The RPC contract between the server part and the GUI.
 *
 * Phase 1 only proves the transport: the panel calls `ping` and the server
 * answers with its plugin version and the location it was loaded for.
 */
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
  },
  events: {},
})
