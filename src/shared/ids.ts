/** The plugin id OpenCode assigns to both the server and GUI parts. */
export const PLUGIN_ID = "git-graph" as const

/** The id of the side panel, unique within this plugin. */
export const PANEL_ID = "graph" as const

/**
 * The key the host uses for a side panel tab: `<plugin id>:<tab id>`.
 *
 * Kept in one place so the panel, the command, and the launcher cannot drift.
 */
export function panelKey(pluginId: string, panelId: string): `${string}:${string}` {
  return `${pluginId}:${panelId}`
}

export const PANEL_KEY = panelKey(PLUGIN_ID, PANEL_ID)
