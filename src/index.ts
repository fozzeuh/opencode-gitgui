import { Plugin } from "@opencode/plugin"
import {
  checkoutBranch,
  checkoutCommit,
  cherryPick,
  pull,
  push,
  readRemotes,
  readStatus,
  reset,
  revert,
} from "./git/actions"
import {
  readBranches,
  readBranchesContaining,
  readCommitFileDiff,
  readCommitFiles,
  fetchAll,
  readHistory,
  readTags,
} from "./git/reader"
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
        readHistory(input.directory, input.limit, input.offset, call.signal, {
          query: input.query,
          branch: input.branch,
        }),
      branches: async (input, call) => readBranches(input.directory, call.signal),
      tags: async (input, call) => readTags(input.directory, call.signal),
      fetchAll: async (input, call) => {
        await fetchAll(input.directory, call.signal)
        return { ok: true }
      },
      branchesContaining: async (input, call) =>
        readBranchesContaining(input.directory, input.hash, call.signal),
      commitFiles: async (input, call) =>
        readCommitFiles(input.directory, input.hash, call.signal),
      commitFileDiff: async (input, call) =>
        readCommitFileDiff(
          input.directory,
          input.hash,
          input.path,
          input.previousPath,
          call.signal,
        ),
      status: async (input, call) => readStatus(input.directory, call.signal),
      remotes: async (input, call) => readRemotes(input.directory, call.signal),
      checkoutBranch: async (input, call) => {
        await checkoutBranch(input.directory, input.branch, call.signal)
        return { ok: true }
      },
      checkoutCommit: async (input, call) => {
        await checkoutCommit(input.directory, input.hash, call.signal)
        return { ok: true }
      },
      cherryPick: async (input, call) => {
        await cherryPick(input.directory, input.hash, call.signal)
        return { ok: true }
      },
      revert: async (input, call) => {
        await revert(input.directory, input.hash, call.signal)
        return { ok: true }
      },
      reset: async (input, call) => {
        await reset(input.directory, input.hash, input.mode, call.signal)
        return { ok: true }
      },
      push: async (input, call) => {
        await push(input.directory, input.remote, input.branch, call.signal)
        return { ok: true }
      },
      pull: async (input, call) => {
        await pull(input.directory, call.signal)
        return { ok: true }
      },
    })
  },
})
