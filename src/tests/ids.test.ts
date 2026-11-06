import { describe, expect, it } from "vitest"
import { PANEL_ID, PANEL_KEY, PLUGIN_ID, panelKey } from "../shared/ids"

describe("plugin identifiers", () => {
  it("uses a panel key the host can resolve", () => {
    expect(PANEL_KEY).toBe("git-graph:graph")
    expect(panelKey(PLUGIN_ID, PANEL_ID)).toBe(PANEL_KEY)
  })

  it("keeps the plugin outside the reserved opencode namespace", () => {
    expect(PLUGIN_ID).not.toBe("opencode")
    expect(PLUGIN_ID.startsWith("opencode.")).toBe(false)
  })
})
