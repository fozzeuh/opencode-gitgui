import {
  Command,
  MenuItem,
  Panel,
  Plugin,
  type PanelTab,
} from "@opencode/plugin/gui"
import { GitGraphPanel } from "./gui/panel"
import { PANEL_ID, PANEL_KEY } from "./shared/ids"

export default Plugin.define({
  i18n: {
    en: {
      "panel.title": "Git Graph",
      "panel.repository": "Repository",
      "panel.phase":
        "Phase 1 — the panel is loaded. Git history, inspection, and actions arrive in the next phases.",
      "panel.test": "Test server",
      "panel.checking": "Contacting server…",
      "panel.connected": "Server connected",
      "panel.error": "Server error",
      "command.open": "Git Graph: Open panel",
      "menu.open": "Git Graph",
    },
    fr: {
      "panel.title": "Git Graph",
      "panel.repository": "Dépôt",
      "panel.phase":
        "Phase 1 — le panneau est chargé. L'historique Git, l'inspection et les actions arrivent aux phases suivantes.",
      "panel.test": "Tester le serveur",
      "panel.checking": "Connexion au serveur…",
      "panel.connected": "Serveur connecté",
      "panel.error": "Erreur serveur",
      "command.open": "Git Graph : ouvrir le panneau",
      "menu.open": "Git Graph",
    },
  },
  setup(ctx) {
    // Pinned for phase 1 so the tab is visible as soon as a session is open.
    // It becomes a closable launcher in the GUI phase.
    const tab: PanelTab = {
      id: PANEL_ID,
      get title() {
        return ctx.t("panel.title")
      },
      pinned: true,
      closable: false,
      fallback: true,
    }

    ctx.add(Panel, {
      id: PANEL_ID,
      region: "side",
      mobile: {
        get title() {
          return ctx.t("panel.title")
        },
        order: 55,
        kind: "menu",
        icon: "branch",
      },
      list: () => [tab],
      render: (props) => <GitGraphPanel session={props.session} />,
    })

    ctx.add(MenuItem, (): MenuItem => {
      const session = ctx.sessions.current()

      return {
        menu: "session.panel",
        id: "open",
        title: ctx.t("menu.open"),
        icon: "branch",
        keybind: `${ctx.id}.open`,
        opened: session ? ctx.layout.state(PANEL_KEY, session) !== "closed" : false,
        run: () => {
          const current = ctx.sessions.current()
          if (current) ctx.layout.open(PANEL_KEY, current)
        },
      }
    })

    ctx.add(Command, (): Command => ({
      id: "open",
      title: ctx.t("command.open"),
      keywords: "git graph history commits branches",
      bind: "mod+shift+g",
      run: () => {
        const session = ctx.sessions.current()
        if (session) ctx.layout.open(PANEL_KEY, session)
      },
    }))
  },
})
