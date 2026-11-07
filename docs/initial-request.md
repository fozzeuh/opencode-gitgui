# Initial request

> Historical record. This is the brief that started the project, kept verbatim
> in French. It describes the full target product, not the current state of the
> implementation. See [changelog.md](./changelog.md) for what has actually been
> built.

# Projet : OpenCode Git Graph

## 1. Objectif

Développer un plugin nommé **OpenCode Git Graph**, qui ajoute un véritable explorateur graphique Git directement dans la sidebar d'OpenCode Desktop.

L'objectif est de proposer une expérience similaire à l'extension Git Graph de VS Code, mais intégrée nativement dans l'interface d'OpenCode.

**Cible exclusive : OpenCode V2.**

Ne cherche pas à assurer la compatibilité avec OpenCode V1, son ancienne API GUI ou d'anciennes versions de son système de plugins.

## 2. Règles fondamentales

Avant de commencer :

1. Consulte la documentation officielle actuelle d'OpenCode V2.
2. Identifie précisément les API disponibles pour les plugins GUI, les panels, les composants, le RPC et les interactions avec le contexte de session.
3. Vérifie les versions réelles des packages et leurs types TypeScript.
4. N'invente aucune API ou méthode.
5. Utilise exclusivement les fonctionnalités documentées et disponibles dans la version V2 ciblée.
6. Ne modifie pas le code source d'OpenCode.
7. Ne développe pas une application web indépendante : le produit doit être un plugin intégré à OpenCode.
8. Ne crée pas de mécanisme de compatibilité V1.

En cas d'incertitude sur une API, vérifie son implémentation ou ses types avant de l'utiliser.

## 3. Stack technique

- TypeScript strict.
- SolidJS pour la GUI.
- SDK officiel `@opencode/plugin/gui` adapté à OpenCode V2.
- SVG pour le rendu graphique des branches et des commits.
- Git CLI pour interagir avec les repositories.
- RPC typé pour communiquer entre le serveur et la GUI.
- Vite pour compiler la GUI.
- Vitest pour les tests.
- ESLint pour la qualité du code.

Utilise les composants natifs et le système de thème d'OpenCode V2 autant que possible.

Évite les dépendances graphiques lourdes et les bibliothèques qui dupliquent les fonctionnalités natives d'OpenCode.

## 4. Fonctionnalités du MVP

### 4.1. Git Graph

Créer un panneau latéral nommé Git Graph.

Il doit afficher :

- L'historique de tous les commits.
- Les branches locales.
- Les branches distantes.
- Les tags.
- La branche actuellement checkout.
- HEAD.
- Les merges.
- Les relations parent-enfant entre commits.

Chaque commit doit afficher :

- Un nœud graphique.
- Son message.
- Son auteur.
- Sa date.
- Ses références éventuelles (branches et tags).

Les différentes branches doivent être représentées par des lignes distinctes avec des couleurs cohérentes.

Le graphe doit être interactif.

### 4.2. Inspection des commits

Lorsqu'un utilisateur sélectionne un commit, afficher :

- Son hash complet et abrégé.
- Son message.
- Son auteur.
- Sa date.
- Ses parents.
- Les branches et tags associés.
- Les fichiers modifiés.
- Les statistiques d'ajout et de suppression.

Permettre de consulter le diff de chaque fichier avec coloration syntaxique.

### 4.3. Actions Git

Implémenter les actions suivantes :

- Checkout d'une branche ou d'un commit.
- Cherry-pick d'un commit.
- Revert d'un commit.
- Reset soft.
- Reset mixed.
- Reset hard.
- Push vers un remote.

Prévoir également Fetch et Pull pour actualiser les références distantes.

Les actions destructrices doivent toujours demander confirmation.

Avant un checkout, avertir l'utilisateur si des changements non commités risquent d'être affectés.

Pour Reset Hard, afficher une confirmation renforcée avec la branche, le commit et les conséquences de l'opération.

Après chaque action, actualiser automatiquement l'historique et le statut du repository.

Gérer proprement les erreurs Git et les conflits.

### 4.4. Recherche et navigation

Ajouter :

- Recherche par message de commit.
- Recherche par hash.
- Filtrage par branche.
- Pagination de l'historique.
- Actualisation manuelle.

Charger initialement 300 commits et permettre de remonter progressivement dans l'historique.

Ne pas charger l'intégralité d'un historique volumineux inutilement.

## 5. Architecture logicielle

Séparer strictement les responsabilités entre GUI, serveur, RPC et logique métier.

Architecture attendue :

- GUI : affichage et interactions utilisateur.
- RPC : contrat typé et communication.
- Server : orchestration des services.
- Git services : accès au repository et commandes Git.
- Graph engine : calcul des positions et des connexions.
- Shared : types et schémas communs.

Le GUI ne doit jamais exécuter directement des commandes Git.

Le serveur ne doit pas contenir de logique de présentation.

Toute communication entre GUI et serveur doit passer par le mécanisme RPC officiellement supporté par OpenCode V2.

## 6. Structure de projet souhaitée

```text
opencode-git-graph/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
│
├── src/
│   ├── index.ts
│   ├── gui.tsx
│   │
│   ├── rpc/
│   │   └── index.ts
│   │
│   ├── shared/
│   │   ├── types.ts
│   │   └── schemas.ts
│   │
│   ├── server/
│   │   ├── index.ts
│   │   ├── git/
│   │   │   ├── executor.ts
│   │   │   ├── repository.ts
│   │   │   ├── history.ts
│   │   │   ├── branches.ts
│   │   │   ├── commits.ts
│   │   │   ├── diff.ts
│   │   │   └── actions.ts
│   │   └── services/
│   │       └── git-service.ts
│   │
│   ├── gui/
│   │   ├── panel.tsx
│   │   ├── components/
│   │   │   ├── GitGraph.tsx
│   │   │   ├── CommitNode.tsx
│   │   │   ├── BranchLabel.tsx
│   │   │   ├── CommitDetails.tsx
│   │   │   ├── DiffViewer.tsx
│   │   │   └── ActionMenu.tsx
│   │   ├── hooks/
│   │   │   ├── useGitHistory.ts
│   │   │   └── useSelectedCommit.ts
│   │   └── graph/
│   │       ├── layout.ts
│   │       ├── lanes.ts
│   │       └── types.ts
│   │
│   └── tests/
│       ├── git/
│       └── graph/
│
└── dist/
    └── gui-experimental.cjs
```

Tu peux ajuster cette structure si la documentation officielle V2 impose une organisation différente, mais conserve la séparation des responsabilités.

## 7. Moteur graphique

C'est une partie essentielle du projet.

Ne te contente pas d'afficher le résultat de `git log --graph`.

Récupère les métadonnées structurées des commits, notamment :

- Hash.
- Parents.
- Auteur.
- Date.
- Message.

Utilise notamment les options de format personnalisé de Git.

Développe ensuite ton propre algorithme de placement des commits.

Chaque commit doit recevoir :

- Une position verticale.
- Une lane horizontale.
- Des connexions vers ses parents.

L'algorithme doit gérer :

- Les branches parallèles.
- Les merges à deux parents ou plus.
- Les branches qui se rejoignent.
- Les commits accessibles depuis plusieurs références.
- Les commits anciens chargés progressivement.

Utilise SVG pour dessiner les connexions et les nœuds.

Évite les croisements de lignes inutiles et assure une bonne lisibilité des branches.

Le moteur graphique doit être totalement indépendant de SolidJS afin de pouvoir être testé unitairement.

## 8. Sécurité

La sécurité des commandes Git est obligatoire.

- Utiliser un processus avec arguments séparés, sans interpolation dans un shell.
- Ne jamais accepter de commande arbitraire depuis la GUI.
- Valider les hashes, références et paramètres.
- Vérifier que les chemins appartiennent au repository ciblé.
- Ne jamais écraser silencieusement des modifications locales.
- Ne jamais exécuter automatiquement un Reset, Push ou autre opération destructive.
- Demander une confirmation explicite pour les actions sensibles.
- Ne pas exposer les secrets Git ou les credentials dans les logs.
- Ne pas effectuer de Fetch ou Push automatique en arrière-plan.

## 9. Qualité et tests

Adopter une approche TDD.

Écrire les tests avant l'implémentation lorsque cela est pertinent.

Prévoir des repositories Git temporaires pour les tests d'intégration.

Couvrir notamment :

- Repository vide.
- Repository classique.
- Historique avec plusieurs branches.
- Merge simple.
- Merge avec plusieurs parents.
- Historique avec tags.
- Commit orphelin ou référence supprimée.
- Historique volumineux.
- Conflits Git.
- Changements locaux non commités.
- Erreurs de commandes.
- Checkout, Cherry-pick, Revert et Reset.

Tester séparément le moteur graphique avec des jeux de données contrôlés.

Aucun test ne doit modifier un repository personnel de développement.

## 10. Design UI/UX

L'interface doit sembler native dans OpenCode.

Respecter :

- Le thème clair et sombre.
- La typographie.
- Les espacements.
- Les composants natifs.
- Les conventions d'interaction d'OpenCode V2.

Prévoir trois zones principales :

1. Barre supérieure : repository, branche courante, recherche et actualisation.
2. Zone centrale : graphe des commits.
3. Zone de détails : informations du commit et fichiers modifiés.

L'affichage des détails peut être réalisé dans une zone inférieure ou un panneau secondaire selon les possibilités réelles de l'API GUI.

Le graphe doit rester lisible sur des fenêtres de petite taille.

## 11. Méthode de développement

Ne développe pas tout le projet en une seule fois.

Procède par phases :

### Phase 1 : Exploration et fondations

- Examiner la documentation OpenCode V2.
- Vérifier le SDK GUI.
- Initialiser le projet.
- Mettre en place TypeScript et Vitest.
- Créer le squelette du plugin.
- Vérifier son chargement dans OpenCode V2.

### Phase 2 : Backend Git

- Implémenter l'exécuteur Git.
- Détecter le repository.
- Lire les branches et tags.
- Récupérer l'historique.
- Ajouter les tests d'intégration.

### Phase 3 : Graph Engine

- Définir le modèle de données.
- Implémenter l'algorithme de lanes.
- Calculer les coordonnées.
- Gérer les merges.
- Tester le rendu des jeux de données.

### Phase 4 : GUI

- Déclarer l'onglet latéral.
- Implémenter le graphe SVG.
- Ajouter les interactions.
- Intégrer le thème natif.
- Connecter le RPC.

### Phase 5 : Inspection et actions

- Détails des commits.
- Visualisation des diffs.
- Checkout.
- Cherry-pick.
- Revert.
- Reset.
- Push, Pull et Fetch.

### Phase 6 : Stabilisation

- Tests complets.
- Gestion des erreurs.
- Optimisation des performances.
- Documentation.
- Installation locale.
- Validation sur OpenCode V2.

## 12. Règles de collaboration avec l'agent IA

Tu es responsable de l'architecture et de la qualité technique de ce projet.

Respecte les règles suivantes :

- Ne fais pas de compromis sur la qualité pour aller plus vite.
- Évite les abstractions prématurées.
- Respecte SOLID lorsque cela apporte une réelle valeur.
- Privilégie du code simple, explicite et testable.
- Évite les composants trop volumineux.
- N'utilise pas de `any` sauf justification exceptionnelle.
- Évite les dépendances inutiles.
- Ne duplique pas les responsabilités entre les couches.
- Documente les décisions architecturales importantes.
- Ne masque jamais une erreur pour faire croire qu'une opération a réussi.

Après chaque phase :

1. Exécuter les tests.
2. Exécuter le typecheck.
3. Vérifier le build.
4. Vérifier le fonctionnement réel dans OpenCode V2 lorsque la phase le nécessite.
5. Présenter un bilan des fonctionnalités terminées et des éventuels problèmes.

Ne passe pas à la phase suivante si la précédente ne fonctionne pas.

## 13. Première tâche à effectuer

Commence uniquement par la phase 1.

Avant d'écrire du code, présente :

- Les API exactes d'OpenCode V2 qui seront utilisées.
- Les packages et leurs versions.
- Le mécanisme réel d'enregistrement du panneau GUI.
- Le mécanisme de communication RPC.
- La stratégie de compilation et de chargement du plugin.
- Les éventuelles limites techniques identifiées.

Ensuite, initialise le projet et réalise un premier plugin minimal qui affiche un onglet Git Graph dans la sidebar d'OpenCode V2.

**Critère de réussite de cette première phase : voir réellement l'onglet Git Graph dans OpenCode V2 et pouvoir ouvrir son panneau.**

Ne simule pas une intégration native si l'API ne la permet pas. Si une fonctionnalité n'est pas supportée, explique précisément la limitation et propose une alternative compatible V2.

À la fin, fournis les commandes nécessaires pour installer, lancer, tester et développer le plugin localement.


ne fais que la phase 1 pour l'instant pour valider que ça fonctionne
