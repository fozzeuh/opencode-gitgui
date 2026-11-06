# OpenCode Git Graph

Plugin GUI natif pour **OpenCode Desktop V2**. Il ajoute un panneau latéral
`Git Graph` dans la sidebar, avec un pont RPC typé entre la GUI SolidJS et la
partie serveur.

> Cible exclusive : OpenCode V2. Aucun support OpenCode V1.

## État — Phase 1

La phase 1 valide l'intégration complète :

- le plugin est découvert par le serveur OpenCode V2 ;
- la GUI est chargée dans chaque fenêtre Desktop ;
- l'onglet `Git Graph` apparaît dans la zone latérale ;
- le panneau s'ouvre et affiche le dépôt de la session ;
- un appel RPC typé `ping` atteint la partie serveur et revient avec sa version.

L'historique Git, le moteur de graphe, l'inspection et les actions arrivent aux
phases suivantes.

## API OpenCode V2 utilisées

| Besoin | API |
| --- | --- |
| Déclaration du plugin serveur | `Plugin.define` de `@opencode/plugin` |
| Déclaration de la GUI | `Plugin.define` de `@opencode/plugin/gui` |
| Onglet latéral | registre `Panel` + type `PanelTab` |
| Lancement du panneau | `MenuItem` (`session.panel`) et `Command` |
| Lecture de la session | `ctx.sessions.current()` |
| Ouverture / état du panneau | `ctx.layout.open()` / `ctx.layout.state()` |
| Contexte dans un composant | `usePlugin()` |
| Composants natifs | `ctx.ui.Icon`, `ctx.ui.Button` |
| Traductions | `ctx.t()` + `i18n` de `Plugin.define` |
| RPC typé | `Rpc.define`, `ctx.rpc.register`, `ctx.client.rpc()` |
| Schémas RPC portables | `Schema.toStandardSchemaV1` de `effect` |
| Bundle GUI | preset `gui()` de `@opencode/plugin/gui/vite` |

## Versions vérifiées

- OpenCode Desktop : `2.2.5`
- OpenCode CLI : `2.2.5`
- `@opencode/plugin` : `2.2.5` (exporte `@opencode/plugin/gui`)
- `effect` : `4.0.6`
- `solid-js` : `1.9.18`
- `vite` : `7.3.7`
- `vite-plugin-solid` : `2.11.15`
- `typescript` : `5.9.3`
- `vitest` : `4.1.12`
- `eslint` : `10.14.0`

## Mécanisme de chargement

Le package expose trois parties :

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./rpc": "./src/rpc.ts",
    "./gui-experimental": "./dist/gui-experimental.cjs"
  }
}
```

- `.` : partie serveur, chargée par le serveur OpenCode.
- `./rpc` : contrat RPC importable par les clients.
- `./gui-experimental` : bundle CommonJS précompilé, chargé par Desktop.

OpenCode Desktop charge les GUI depuis son serveur d'arrière-plan, qui lit les
plugins du `opencode.json(c)` global. Une entrée locale doit être un **dossier**
contenant un `package.json` avec `name` et `exports` :

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["/Users/maximedeharbonnier/Projects/opencode-gitgui"]
}
```

L'id du plugin (`git-graph`) vient de la partie serveur. La clé de l'onglet est
donc `git-graph:graph`.

## Développement

```bash
npm install
npm run dev        # vite build --watch, recharge la GUI à chaque build
```

Après une modification de la partie serveur, recharger la configuration :

```bash
/Applications/OpenCode.app/Contents/Resources/opencode-cli reload
```

## Vérifications

```bash
npm run typecheck
npm run lint
npm test
npm run build
# ou tout à la fois :
npm run check
```

## Installation locale

1. Construire la GUI :

   ```bash
   npm run build
   ```

2. Vérifier que le plugin est vu :

   ```bash
   /Applications/OpenCode.app/Contents/Resources/opencode-cli plugin list
   ```

3. Recharger la configuration OpenCode, puis ouvrir une session. L'onglet
   `Git Graph` est épinglé dans la zone latérale. Il est aussi accessible via :
   - le menu `+` de la zone latérale ;
   - la palette de commandes (`Git Graph: Open panel`, `mod+shift+g`).

## Limites connues de la phase 1

- L'API GUI V2 est **expérimentale** (`gui-experimental`) et peut changer entre
  versions d'OpenCode.
- Desktop ne lit que `opencode.json(c)` pour les plugins GUI ; `cli.json` ne
  suffit pas.
- Un plugin dont la partie serveur échoue n'a pas de GUI.
- Les ids du namespace `opencode` et ceux des plugins intégrés sont réservés.
- Le `setup` de fenêtre est synchrone ; le travail asynchrone doit vivre dans un
  composant, `createKeyed` ou `createLatest`.
- Pour garantir la visibilité en phase 1, l'onglet est `pinned`. Il deviendra un
  onglet refermable piloté par un lanceur dans la phase GUI.

## Structure

```text
src/
├── index.ts          # partie serveur : enregistrement du RPC
├── rpc.ts            # contrat RPC typé
├── gui.tsx           # entrée GUI : Panel, MenuItem, Command
├── gui/
│   └── panel.tsx     # contenu SolidJS du panneau
├── shared/
│   └── ids.ts        # ids et clé d'onglet
└── tests/
    └── ids.test.ts
```
