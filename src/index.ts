import { Plugin } from "@opencode/plugin"
import { readBranches, readBranchesContaining, readHistory } from "./git/reader"
import { GitGraphRpc } from "./rpc"

const VERSION = "0.1.0"

export default Plugin.define({
  id: "git-graph",
  async setup(ctx) {
    await ctx.rpc.register(GitGraphRpc, {
      ping: async () => ({
        ok: true,
        version: VERSION,
        directory: ctx.location.directory,
      }),
      history: async (input, call) =>
        readHistory(input.directory, input.limit, input.offset, call.signal),
      branches: async (input, call) => readBranches(input.directory, call.signal),
      branchesContaining: async (input, call) =>
        readBranchesContaining(input.directory, input.hash, call.signal),
    })
  },
})
