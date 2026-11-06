import { Plugin } from "@opencode/plugin"
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
    })
  },
})
