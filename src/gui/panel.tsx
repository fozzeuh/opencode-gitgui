import type { MountedSession } from "@opencode/plugin/gui"
import { usePlugin } from "@opencode/plugin/gui"
import { createSignal, Show } from "solid-js"
import { GitGraphRpc } from "../rpc"

type PingStatus = "idle" | "checking" | "ok" | "error"

/**
 * Phase 1 panel: proves the plugin is mounted in the native side region and
 * that the GUI can reach the server part over the typed RPC bridge.
 */
export function GitGraphPanel(props: { readonly session: MountedSession }) {
  const ctx = usePlugin()
  const [status, setStatus] = createSignal<PingStatus>("idle")
  const [detail, setDetail] = createSignal("")

  const checkServer = async () => {
    setStatus("checking")
    setDetail("")

    try {
      const result = await ctx.client.rpc(GitGraphRpc).ping({})
      setDetail(`${ctx.t("panel.connected")} · ${result.version}`)
      setStatus("ok")
    } catch (cause) {
      setDetail(cause instanceof Error ? cause.message : String(cause))
      setStatus("error")
    }
  }

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "14px",
        height: "100%",
        padding: "12px",
        overflow: "auto",
      }}
    >
      <header style={{ display: "flex", "align-items": "center", gap: "8px" }}>
        <ctx.ui.Icon name="branch" />
        <strong style={{ "font-size": "13px", "font-weight": 600 }}>{ctx.t("panel.title")}</strong>
      </header>

      <section style={{ display: "flex", "flex-direction": "column", gap: "4px" }}>
        <span style={{ "font-size": "11px", opacity: 0.65 }}>{ctx.t("panel.repository")}</span>
        <code
          style={{
            display: "block",
            "font-family": "inherit",
            "font-size": "12px",
            "line-height": 1.5,
            opacity: 0.85,
            "word-break": "break-all",
          }}
        >
          {props.session.directory}
        </code>
      </section>

      <section style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
        <ctx.ui.Button
          icon="branch"
          size="small"
          busy={status() === "checking"}
          onClick={() => void checkServer()}
        >
          {status() === "checking" ? ctx.t("panel.checking") : ctx.t("panel.test")}
        </ctx.ui.Button>

        <Show when={detail()}>
          {(text) => (
            <span
              style={{
                display: "flex",
                "align-items": "center",
                gap: "6px",
                "font-size": "11px",
                "line-height": 1.5,
                opacity: 0.75,
              }}
            >
              <ctx.ui.Icon name={status() === "error" ? "circle-x" : "circle-check"} size="small" />
              {text()}
            </span>
          )}
        </Show>
      </section>

      <p style={{ margin: 0, "font-size": "11px", "line-height": 1.6, opacity: 0.6 }}>{ctx.t("panel.phase")}</p>
    </div>
  )
}
