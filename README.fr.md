<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/runforge-vscode/readme.png" alt="RunForge Logo" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/runforge-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/runforge-vscode/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/runforge-vscode"><img src="https://codecov.io/gh/mcp-tool-shop-org/runforge-vscode/branch/main/graph/badge.svg" alt="Coverage"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.runforge"><img src="https://img.shields.io/visual-studio-marketplace/v/mcp-tool-shop.runforge.svg" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/runforge-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

> **Avis aux utilisateurs du marché v1.0.1 (version du 25 mars 2026) :** La version 1.0.1 comportait cinq
> bogues critiques qui affectaient les commandes `Train`, la navigation et les vues de
> surveillance (cause : une régression dans l'invocation de processus et un décalage entre
> les chemins et les structures de données entre l'écrivain et les lecteurs). Ces cinq bogues
> ont été corrigés dans la version **1.1.0**, qui inclut également les fonctionnalités de la
> phase 4 (annulation en cours, reprise, sécurité de l'espace de travail). Si vous avez installé
> la version 1.0.1, veuillez passer à la version 1.1.0. Consultez les [notes de la version 1.0.1](docs/MARKETPLACE_NOTE_v1.0.1.md)
> et le fichier [`CHANGELOG.md`](CHANGELOG.md#110---2026-04-25) pour plus de détails.

Formation ML par simple clic, avec un comportement déterministe et basé sur des contrats.

> **La phase 3 (capacités et interprétabilité) est figée à la version 0.3.6.0.
> La phase 4 (cycle de vie et reprise) est disponible dans la version 1.1.0** — voir le [contrat de la phase 4](CONTRACT-PHASE-4.md).

## Nouveautés de la version 1.1.0

1. **Annulation de la formation en cours** (`RunForge: Annuler la formation active`) — annulez une
formation en cours via la palette de commandes ou le bouton d'annulation de notification de
progression de VS Code. Délai de 5 secondes avec le signal SIGTERM, puis SIGKILL. Les
formations annulées sont marquées avec un fichier `.cancelled` afin que la reprise et le
sélectionneur de formations puissent les classer correctement.
2. **Reprise de l'index** (`RunForge: Restaurer l'index`) — parcourt le répertoire `.ml/runs/` et
réajoute toutes les formations manquantes dans le fichier `.ml/outputs/index.json`. Opération
idempotente. Utile après un plantage de l'écriture ou un déplacement de l'espace de travail.
3. **Protection de la sécurité de l'espace de travail** — le lancement de processus Python nécessite
désormais `vscode.workspace.isTrusted`. Les espaces de travail non sécurisés affichent une
erreur explicite avec un lien vers l'interface de gestion de la sécurité de l'espace de travail.
4. **Notifications de progression par époque** — la formation affiche la progression en direct et
expose un bouton d'annulation via `vscode.window.withProgress`.
5. **Messages d'erreur CSV améliorés** — les délimiteurs non-virgules, les encodages non-UTF-8,
les étiquettes entièrement NaN, les fichiers CSV à une seule colonne et les fichiers CSV
contenant uniquement des en-têtes génèrent des diagnostics spécifiques et exploitables au lieu
de traces pandas obscures.
6. **Règles ESLint personnalisées** qui appliquent les principes architecturaux codifiés dans
le fichier [`docs/CONTRACTS.md`](docs/CONTRACTS.md) (pas de duplication de valeurs canoniques,
pas de types masqués dans les modules consommateurs).
7. **Documentation des principes** — le fichier [`docs/CONTRACTS.md`](docs/CONTRACTS.md) codifie
désormais les six règles architecturales + les sept modèles opérationnels issus de cinq
cycles d'audit structurés. Ces modèles sont incontournables pour tout travail inter-domaines
(TS / Python / surveillance).

De plus, la version 1.1.0 corrige les cinq bogues critiques de la version 1.0.1 (`F-COORD-003`,
`F-COORD-004`, `F-COORD-008`, `F-COORD-010`, `F-COORD-011`). Consultez le fichier
[`CHANGELOG.md`](CHANGELOG.md) pour obtenir la liste complète.

---

## 🛡️ La garantie RunForge

RunForge est un logiciel qui a pour objectif de remplacer l'expression "ça marche sur ma machine"
par une certitude basée sur des preuves.

### Ce que nous garantissons
1. **Déterminisme**: Chaque exécution est initialisée. La réexécution de la même configuration avec
la même initialisation sur les mêmes données produit exactement le même modèle.
2. **Traçabilité**: Chaque enregistrement `run.json` inclut le SHA du commit Git, le chemin de
l'interpréteur Python et la version de l'extension utilisés. Vous pouvez retracer n'importe quel
modèle jusqu'au code qui l'a créé.
3. **Auditabilité**: Les artefacts (modèles, métriques, journaux) sont enregistrés sur disque dans
des formats standard (JSON, joblib). Pas de bases de données cachées, pas de dépendances
cloud.

### Ce que ce n'est pas
- **Pas un outil AutoML magique**: Nous ne devinons pas ce que vous voulez. Nous exécutons des
configurations spécifiques et paramétrables.
- **Pas une plateforme cloud**: Nous ne transmettons pas vos données à un endroit. Tout se passe
localement dans votre espace de travail VS Code.

Pour connaître le modèle de confiance complet, consultez [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md).

### Sécurité et portée des données

**Données concernées :** fichiers CSV de l'espace de travail (lecture seule pour l'entraînement), répertoire `.ml/` (métadonnées d'exécution, artefacts du modèle, métriques JSON), sortie standard/erreur standard des processus Python. **Données non concernées :** aucun fichier en dehors de l'espace de travail, aucune donnée du navigateur, aucune information d'identification du système d'exploitation. **Autorisations requises :** accès en lecture/écriture sur le système de fichiers uniquement dans l'espace de travail, exécution de processus Python. **Pas de communication réseau sortante** — toutes les opérations sont locales. **Aucune télémétrie** n'est collectée ou envoyée.

### Cycle de vie d'une exécution

```
dataset.csv
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  Training (run_training)                                    │
│                                                             │
│  1. Validate dataset (label column, numeric values)         │
│  2. Compute dataset fingerprint (SHA-256)                   │
│  3. Split 80/20 train/val (deterministic, stratified)       │
│  4. Fit pipeline (StandardScaler + Classifier)              │
│  5. Compute metrics                                         │
│  6. Extract interpretability (if supported)                 │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
.ml/runs/<run-id>/
    ├── run.json                              ← Metadata + pointers
    ├── metrics.json                          ← Phase 2 metrics (3 keys)
    ├── metrics.v1.json                       ← Detailed metrics by profile
    └── artifacts/
        ├── model.pkl                         ← Trained pipeline
        ├── feature_importance.v1.json        ← (RandomForest only)
        ├── linear_coefficients.v1.json       ← (Linear models only)
        └── interpretability.index.v1.json    ← Unified index
```

---

## Installation

```bash
npm install
npm run compile
```

## Commandes

| Commande | Description |
|---------|-------------|
| `RunForge: Train (Standard)` | Exécuter l'entraînement avec le profil standard |
| `RunForge: Train (High Quality)` | Exécuter l'entraînement avec le profil haute qualité |
| `RunForge: Open Runs` | Afficher les exécutions d'entraînement terminées |
| `RunForge: Inspect Dataset` | Valider l'ensemble de données avant l'entraînement (v0.2.2.1+) |
| `RunForge: Open Latest Run Metadata` | Afficher les métadonnées de la dernière exécution (v0.2.2.1+) |
| `RunForge: Inspect Model Artifact` | Afficher la structure du pipeline du fichier model.pkl (v0.2.2.2+) |
| `RunForge: Browse Runs` | Parcourir toutes les exécutions avec les actions (résumé, diagnostics, artefact) (v0.2.3+) |
| `RunForge: View Latest Metrics` | Afficher les métriques détaillées du fichier metrics.v1.json (v0.3.3+) |
| `RunForge: View Latest Feature Importance` | Afficher l'importance des caractéristiques pour les modèles RandomForest (v0.3.4+) |
| `RunForge: View Latest Linear Coefficients` | Afficher les coefficients pour les modèles linéaires (v0.3.5+) |
| `RunForge: View Latest Interpretability Index` | Afficher l'index unifié de tous les artefacts d'interprétabilité (v0.3.6+) |
| `RunForge: Export Latest Run as Markdown` | Enregistrer un résumé formaté en Markdown de la dernière exécution (v0.4.3+) |

## Utilisation

1. Définir la variable d'environnement `RUNFORGE_DATASET` avec le chemin de votre fichier CSV.
2. Le fichier CSV doit avoir une colonne nommée `label`.
3. Exécuter l'entraînement via la palette de commandes.

---

## Garanties (v0.2.1+)

RunForge VS Code fournit un entraînement de modèles d'apprentissage automatique déterministe et basé sur des contrats. Les garanties ci-dessous sont intentionnelles et sont vérifiées par des tests.

### Déterminisme

Étant donné le même ensemble de données, la même configuration et la même version de RunForge :

- Les divisions entraînement/validation sont identiques pour toutes les exécutions.
- Les artefacts générés sont reproductibles.
- Les sorties de métriques sont stables.

Il n'y a pas de comportement aléatoire en dehors des comportements explicitement initialisés.

### Gestion des étiquettes

- La colonne des étiquettes est spécifiée explicitement.
- L'étiquette n'est jamais inférée par la position de la colonne.
- Les étiquettes mal configurées ou manquantes entraînent une erreur dès le début.

### Contrat des métriques

L'entraînement produit exactement trois métriques :

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

Aucun autre champ n'est ajouté implicitement.
L'extension du schéma nécessite une modification de contrat versionnée.

### Artefacts du modèle

- `model.pkl` est toujours un objet `sklearn.Pipeline` sérialisé.
- Tout le prétraitement (par exemple, la mise à l'échelle) est intégré.
- L'artefact est autonome et prêt pour l'inférence.

Aucune étape de prétraitement externe n'est requise.

### Données manquantes

- Les lignes contenant des valeurs manquantes sont supprimées de manière déterministe.
- Le nombre de lignes supprimées est enregistré.
- Aucune imputation silencieuse ne se produit.

### Source de vérité

- Toute la logique d'exécution Python se trouve dans le répertoire `python/ml_runner/`.
- Il n'y a pas d'implémentation dupliquée ou cachée.
- Les tests garantissent la cohérence entre le comportement TypeScript et Python.

### Politique de stabilité

- Le comportement de la version v0.2.1 est figé.
- Les modifications qui cassent la compatibilité nécessitent une augmentation explicite de la version majeure.
- Les modifications de comportement silencieuses sont considérées comme des bogues.

---

## Objectifs non poursuivis (intentionnellement)

RunForge ne tente actuellement pas de :

- Sélectionner automatiquement les modèles (l'utilisateur doit choisir explicitement).
- Ajuster les hyperparamètres (les valeurs par défaut sont fixes pour chaque profil).
- Effectuer un entraînement en ligne ou incrémental.
- Cacher le comportement de l'entraînement derrière des heuristiques.

La correction et la transparence sont prioritaires par rapport à l'automatisation.

---

---

## Observabilité (v0.2.2.1+)

La version 2.2.1 ajoute une visibilité sur les exécutions d'entraînement sans modifier le comportement de l'entraînement.

### Métadonnées de l'exécution

Chaque exécution d'entraînement génère un fichier `run.json` contenant les informations suivantes :

- Identifiant de l'exécution et horodatage
- Empreinte numérique du jeu de données (SHA-256)
- Colonne des étiquettes et nombre de caractéristiques
- Nombre de lignes supprimées
- Aperçu des métriques
- Chemins des artefacts

### Inspection des jeux de données

Inspectez les jeux de données avant l'entraînement :

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Renvoie les noms des colonnes, le nombre de lignes, le nombre de caractéristiques et la validation des étiquettes.

### Suivi de la provenance

Toutes les exécutions sont indexées dans le fichier `.ml/outputs/index.json` pour assurer la traçabilité :

- À partir d'un fichier `model.pkl`, remontez aux métadonnées de l'exécution.
- Trouvez toutes les exécutions pour une empreinte numérique de jeu de données donnée.
- L'index est en mode ajout uniquement (il ne réorganise ni ne supprime jamais de données).

---

## Inspection des artefacts (v0.2.2.2+)

La phase 2.2.2 ajoute une inspection en lecture seule des artefacts entraînés.

**L'inspection est en lecture seule et ne réentraîne ni ne modifie les artefacts.**

### Inspection du pipeline

Inspectez le contenu d'un fichier `model.pkl` sans réentraînement :

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Renvoie un JSON structuré contenant :

- Les étapes du pipeline (dans l'ordre)
- Les types d'étapes et les modules
- La détection du prétraitement

Exemple de sortie :

```json
{
  "schema_version": "0.2.2.2",
  "artifact_path": "model.pkl",
  "pipeline_steps": [
    {"name": "scaler", "type": "StandardScaler", "module": "sklearn.preprocessing._data"},
    {"name": "clf", "type": "LogisticRegression", "module": "sklearn.linear_model._logistic"}
  ],
  "has_preprocessing": true,
  "step_count": 2
}
```

### Diagnostics

Les diagnostics structurés expliquent pourquoi une exécution s'est comportée d'une certaine manière :

| Code | Description |
|------|-------------|
| `MISSING_VALUES_DROPPED` | Lignes supprimées en raison de valeurs manquantes |
| `LABEL_NOT_FOUND` | La colonne des étiquettes n'est pas présente dans le jeu de données |
| `LABEL_TYPE_INVALID` | La colonne des étiquettes a un type invalide |
| `ZERO_ROWS` | Le jeu de données ne contient aucune ligne après le traitement |
| `ZERO_FEATURES` | Le jeu de données ne contient aucune colonne de caractéristiques |
| `LABEL_ONLY_DATASET` | Le jeu de données ne contient que la colonne des étiquettes |

Tous les diagnostics sont en JSON, lisibles par machine (pas besoin d'analyse de journaux).

---

## Parcourir les exécutions (v0.2.3+)

La phase 2.3 ajoute un navigateur d'exécutions unifié avec des actions rapides.

### Utilisation du navigateur d'exécutions

1. Ouvrez la palette de commandes (`Ctrl+Shift+P`)
2. Exécutez `RunForge: Parcourir les exécutions`
3. Sélectionnez une exécution dans la liste (la plus récente en premier)
4. Choisissez une action :
- **Ouvrir le résumé de l'exécution** — Affiche les métadonnées de l'exécution au format Markdown lisible
- **Afficher les diagnostics** — Affiche ce qui s'est passé pendant l'exécution
- **Inspecter l'artefact du modèle** — Affiche la structure du pipeline
- **Copier l'empreinte numérique du jeu de données** — Copie la valeur SHA-256 dans le presse-papiers

### Diagnostics synthétisés

Les diagnostics sont dérivés des champs du fichier `run.json` :

| Condition | Diagnostic |
|-----------|------------|
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

L'émission complète de diagnostics structurés est prévue pour les phases ultérieures.

---

## Sélection du modèle (v0.3.1+)

La phase 3.1 ajoute une sélection explicite du modèle tout en préservant toutes les garanties de la phase 2.

### Modèles pris en charge

| Modèle | Valeur CLI | Description |
|-------|-----------|-------------|
| Régression logistique | `logistic_regression` | Par défaut, rapide, interprétable |
| Forêt aléatoire | `random_forest` | Ensemble, gère les motifs non linéaires |
| SVC linéaire | `linear_svc` | Classificateur à vecteurs de support, basé sur la marge |

### Configuration

Définissez la famille de modèles dans les paramètres de VS Code :

```json
{
  "runforge.modelFamily": "random_forest"
}
```

Ou utilisez l'interface utilisateur des paramètres : Recherchez "RunForge Model Family" et sélectionnez-en une dans la liste déroulante.

### Utilisation de la ligne de commande

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

L'argument `--model` est facultatif. Valeur par défaut : `logistic_regression`.

### Provenance

La famille de modèles sélectionnée est enregistrée dans le fichier `run.json` :

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Compatibilité ascendante

- Toutes les exécutions de la phase 2 restent lisibles
- Le comportement par défaut n'a pas changé (régression logistique)
- Aucune migration n'est requise
- Le prétraitement reste fixe (StandardScaler pour tous les modèles)

---

## Hyperparamètres et profils d'entraînement (v0.3.2+)

La phase 3.2 ajoute un contrôle explicite des hyperparamètres et des profils d'entraînement.

### Profils d'entraînement

Les profils prédéfinis fournissent des hyperparamètres préconfigurés :

| Profil | Description | Famille de modèles |
|---------|-------------|--------------|
| `default` | Aucune surcharge de hyperparamètre | (utilise le paramètre) |
| `fast` | Nombre d'itérations réduit pour des exécutions rapides | régression_logistique |
| `thorough` | Plus d'arbres/itérations pour une meilleure qualité | forêt_aléatoire |

Configuration dans les paramètres de VS Code :
```json
{
  "runforge.profile": "fast"
}
```

### Hyperparamètres de la ligne de commande

Surcharge des hyperparamètres individuels via la ligne de commande :

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Règles de priorité

Lorsque les paramètres du profil et de la ligne de commande sont définis :

1. **`--param` de la ligne de commande** (priorité la plus élevée)
2. **Paramètres étendus par le profil**
3. **Valeurs par défaut du modèle** (priorité la plus faible)

### Provenance

Les hyperparamètres et les profils sont enregistrés dans `run.json` :

```json
{
  "model_family": "random_forest",
  "profile_name": "thorough",
  "profile_version": "1.0",
  "expanded_parameters_hash": "abc123...",
  "hyperparameters": [
    {"name": "n_estimators", "value": 200, "source": "profile"},
    {"name": "max_depth", "value": 5, "source": "cli"}
  ]
}
```

Lorsqu'aucun profil n'est utilisé, les champs du profil sont complètement omis (et non définis).

---

## Métriques spécifiques au modèle (v0.3.3+)

La version 3.3 ajoute des métriques détaillées et spécifiques au modèle, avec une sélection de profil basée sur les capacités.

### Profils de métriques

Les profils de métriques sont sélectionnés automatiquement en fonction des capacités du modèle :

| Profil | Description | Métriques |
|---------|-------------|---------|
| `classification.base.v1` | Tous les classificateurs | précision, exactitude, rappel, f1, matrice de confusion |
| `classification.proba.v1` | Binaire + `predict_proba` | de base + ROC-AUC, log loss |
| `classification.multiclass.v1` | 3 classes ou plus | de base + précision/rappel/f1 par classe |

### Logique de sélection du profil

- Classification binaire + `predict_proba` → `classification.proba.v1`
- Classification multiclasse (3 classes ou plus) → `classification.multiclass.v1`
- Sinon → `classification.base.v1`

### Capacités du modèle

| Modèle | `predict_proba` | `decision_function` |
|-------|---------------|-------------------|
| RégressionLogistique | ✅ | ✅ |
| ForêtAléatoire | ✅ | ❌ |
| LinearSVC | ❌ | ✅ (ROC-AUC uniquement) |

### Artefact des métriques

L'entraînement produit maintenant `metrics.v1.json` en plus de `metrics.json` :

```json
{
  "schema_version": "metrics.v1",
  "metrics_profile": "classification.proba.v1",
  "num_classes": 2,
  "accuracy": 0.95,
  "precision_macro": 0.94,
  "recall_macro": 0.93,
  "f1_macro": 0.94,
  "confusion_matrix": [[45, 5], [3, 47]],
  "roc_auc": 0.97,
  "log_loss": 0.15
}
```

### Métadonnées de l'exécution

`run.json` inclut maintenant un pointeur vers `metrics_v1` :

```json
{
  "schema_version": "run.v0.3.6",
  "metrics_v1": {
    "schema_version": "metrics.v1",
    "metrics_profile": "classification.proba.v1",
    "artifact_path": "metrics.v1.json"
  },
  "artifacts": {
    "model_pkl": "artifacts/model.pkl",
    "metrics_v1_json": "metrics.v1.json"
  }
}
```

### Compatibilité ascendante

- `metrics.json` (version 2) reste inchangé
- Tous les outils existants continuent de fonctionner
- Les champs du profil dans `run.json` apparaissent ensemble ou pas du tout

---

## Importance des caractéristiques (v0.3.4+)

La version 3.4 ajoute l'extraction en lecture seule de l'importance des caractéristiques pour les modèles pris en charge.

### Modèles pris en charge

L'importance des caractéristiques n'est disponible que pour les modèles disposant de signaux d'importance natifs :

| Modèle | Pris en charge | Type d'importance |
|-------|-----------|-----------------|
| ForêtAléatoire | ✅ | Importance de Gini |
| RégressionLogistique | ❌ | Non disponible en v1 |
| LinearSVC | ❌ | Non disponible en v1 |

**Aucune approximation** : Si le modèle ne prend pas en charge l'importance native, aucun artefact n'est généré.

### Artefact de l'importance des caractéristiques

Les exécutions de la forêt aléatoire produisent `artifacts/feature_importance.v1.json` :

```json
{
  "schema_version": "feature_importance.v1",
  "model_family": "random_forest",
  "importance_type": "gini_importance",
  "num_features": 10,
  "features_by_importance": [
    {"name": "feature_a", "importance": 0.35, "rank": 1},
    {"name": "feature_b", "importance": 0.25, "rank": 2}
  ],
  "features_by_original_order": [
    {"name": "feature_a", "importance": 0.35, "index": 0},
    {"name": "feature_b", "importance": 0.25, "index": 1}
  ],
  "top_k": ["feature_a", "feature_b"]
}
```

### Métadonnées de l'exécution

`run.json` inclut une référence à l'importance des caractéristiques lorsque celle-ci est disponible :

```json
{
  "feature_importance_schema_version": "feature_importance.v1",
  "feature_importance_artifact": "artifacts/feature_importance.v1.json",
  "artifacts": {
    "model_pkl": "artifacts/model.pkl",
    "feature_importance_json": "artifacts/feature_importance.v1.json"
  }
}
```

Lorsque l'importance des caractéristiques n'est pas disponible, ces champs sont complètement omis (et non définis).

### Diagnostics

Les modèles non pris en charge génèrent des diagnostics structurés :

| Code | Description |
|------|-------------|
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | Le modèle ne prend pas en charge l'importance native des caractéristiques |
| `FEATURE_NAMES_UNAVAILABLE` | Les noms des caractéristiques n'ont pas pu être résolus |

### Non pris en charge en v1

Les éléments suivants sont explicitement exclus de la version 1 :

- Importance basée sur les coefficients pour les modèles linéaires
- Explications SHAP/LIME
- Importance par permutation
- Graphiques de dépendance partielle

### Hyperparamètres pris en charge

**Régression logistique :**
- `C` (flottant, > 0) : Force de régularisation
- `max_iter` (entier, > 0) : Nombre maximal d'itérations
- `solver` (chaîne de caractères) : Solveur d'optimisation
- `warm_start` (booléen) : Réutiliser la solution précédente

**Forêt aléatoire :**
- `n_estimators` (entier, > 0) : Nombre d'arbres
- `max_depth` (entier ou None) : Profondeur maximale de l'arbre
- `min_samples_split` (entier, >= 2) : Nombre minimal d'échantillons pour la division
- `min_samples_leaf` (entier, > 0) : Nombre minimal d'échantillons par feuille

**SVC linéaire :**
- `C` (flottant, > 0) : Force de régularisation
- `max_iter` (entier, > 0) : Nombre maximal d'itérations

---

## Coefficients linéaires (v0.3.5+)

La version 3.5 ajoute l'extraction en lecture seule des coefficients pour les classificateurs linéaires.

### Modèles pris en charge

Les coefficients sont disponibles pour les modèles qui possèdent l'attribut `coef_` natif :

| Modèle | Pris en charge | Type de coefficient |
|-------|-----------|------------------|
| RégressionLogistique | ✅ | Coefficients de log-cotes |
| LinearSVC | ✅ | Coefficients SVM |
| ForêtAléatoire | ❌ | Utilisez plutôt l'importance des caractéristiques |

**Pas d'approximations :** Si le modèle ne prend pas en charge les coefficients natifs, aucun artefact n'est généré.

### Espace des coefficients (IMPORTANT)

**Tous les coefficients sont dans l'espace des caractéristiques NORMALISÉ.**

Cela signifie :
- Les coefficients correspondent aux caractéristiques APRÈS l'application de StandardScaler
- Les valeurs représentent l'influence par augmentation d'1 écart-type
- Aucune tentative n'est faite pour "inverser" la normalisation pour revenir aux unités brutes des caractéristiques
- La comparaison des coefficients entre les caractéristiques est significative (même échelle)
- La comparaison des coefficients aux valeurs brutes des caractéristiques N'EST PAS significative

### Artefact des coefficients linéaires

Les exécutions des modèles linéaires produisent le fichier `artifacts/linear_coefficients.v1.json` :

```json
{
  "schema_version": "linear_coefficients.v1",
  "model_family": "logistic_regression",
  "coefficient_space": "standardized",
  "num_features": 10,
  "num_classes": 2,
  "classes": [0, 1],
  "intercepts": [
    {"class": 1, "intercept": 0.5}
  ],
  "coefficients_by_class": [
    {
      "class": 1,
      "features": [
        {"name": "feature_a", "coefficient": 2.35, "abs_coefficient": 2.35, "rank": 1},
        {"name": "feature_b", "coefficient": -1.25, "abs_coefficient": 1.25, "rank": 2}
      ]
    }
  ],
  "top_k_by_class": [
    {"class": 1, "top_features": ["feature_a", "feature_b"]}
  ]
}
```

### Prise en charge de la classification multiclasse

Pour la classification multiclasse (3 classes ou plus), les coefficients sont regroupés par classe :

- Chaque classe possède son propre ensemble de coefficients
- Les étiquettes de classe sont triées de manière déterministe
- Aucune agrégation entre les classes dans la version 1

### Métadonnées de l'exécution

Le fichier `run.json` inclut une référence aux coefficients linéaires lorsque ceux-ci sont disponibles :

```json
{
  "linear_coefficients_schema_version": "linear_coefficients.v1",
  "linear_coefficients_artifact": "artifacts/linear_coefficients.v1.json",
  "artifacts": {
    "model_pkl": "artifacts/model.pkl",
    "linear_coefficients_json": "artifacts/linear_coefficients.v1.json"
  }
}
```

Lorsque les coefficients ne sont pas disponibles, ces champs sont complètement omis (et non mis à null).

### Diagnostics

Les modèles non pris en charge génèrent des diagnostics structurés :

| Code | Description |
|------|-------------|
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | Le modèle ne prend pas en charge l'extraction des coefficients |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | Le classificateur ne possède pas l'attribut `coef_` |
| `FEATURE_NAMES_UNAVAILABLE` | Les noms des caractéristiques n'ont pas pu être résolus |

### Importance des caractéristiques vs. coefficients linéaires

| Artefact | Modèles pris en charge | Ce que cela montre |
|----------|------------------|---------------|
| Importance des caractéristiques (v0.3.4) | ForêtAléatoire | Importance de Gini (basée sur les arbres) |
| Coefficients linéaires (v0.3.5) | LogisticRegression, LinearSVC | Coefficients du modèle |

Ceux-ci sont complémentaires :
- Utilisez l'importance des caractéristiques pour les modèles d'ensemble
- Utilisez les coefficients linéaires pour les modèles linéaires interprétables

### Guide d'interprétation

Pour LogisticRegression (binaire) :
- Coefficient positif : Augmentation de la caractéristique → Probabilité plus élevée de la classe positive
- Coefficient négatif : Augmentation de la caractéristique → Probabilité plus faible de la classe positive
- Magnitude : Valeur absolue plus grande = Influence plus forte

Exemple : `coefficient = 2.0` signifie +1 écart-type dans cette caractéristique → +2.0 pour les log-cotes

---

## Indice d'interprétabilité (v0.3.6+)

La version 3.6 ajoute un artefact d'indice unifié qui relie toutes les sorties d'interprétabilité pour une exécution.

### Objectif

L'indice d'interprétabilité répond à la question : "Quelles sont les sorties d'interprétabilité disponibles pour cette exécution, quelles sont leurs versions et où se trouvent-elles ?"

Aucun nouveau calcul - juste un lien et un résumé des artefacts existants.

### Artefact de l'indice

Chaque exécution produit le fichier `artifacts/interpretability.index.v1.json` :

```json
{
  "schema_version": "interpretability.index.v1",
  "run_id": "20240101-120000-abc12345",
  "runforge_version": "0.3.6.0",
  "created_at": "2024-01-01T12:00:00+00:00",
  "available_artifacts": {
    "metrics_v1": {
      "schema_version": "metrics.v1",
      "path": "metrics.v1.json",
      "summary": {
        "metrics_profile": "classification.proba.v1",
        "accuracy": 0.95
      }
    },
    "feature_importance_v1": {
      "schema_version": "feature_importance.v1",
      "path": "artifacts/feature_importance.v1.json",
      "summary": {
        "model_family": "random_forest",
        "top_k": ["feature_a", "feature_b", "feature_c"]
      }
    },
    "linear_coefficients_v1": {
      "schema_version": "linear_coefficients.v1",
      "path": "artifacts/linear_coefficients.v1.json",
      "summary": {
        "model_family": "logistic_regression",
        "num_classes": 2,
        "top_k_by_class": [{"class": 1, "top_features": ["feat_a", "feat_b"]}]
      }
    }
  }
}
```

### Règles de disponibilité

- Les artefacts absents sont **omis** de `available_artifacts` (et non mis à null ou false)
- L'indice ne prétend être disponible que si le fichier existe réellement
- Une exécution minimale (LogisticRegression) aura `metrics_v1` et `linear_coefficients_v1`
- Une exécution RandomForest aura `metrics_v1` et `feature_importance_v1`

### Contenu du résumé

Les résumés ne contiennent que des données de référence (sans valeurs numériques dupliquées) :

| Artefact | Résumé contenant : |
|----------|------------------|
| metrics_v1 | `metrics_profile`, `accuracy` (provenant de run.json) |
| feature_importance_v1 | `model_family`, `top_k` (noms uniquement, maximum 5) |
| linear_coefficients_v1 | `model_family`, `num_classes`, `top_k_by_class` (noms uniquement) |

### Commande VS Code

Utilisez la commande `RunForge: Afficher l'indice d'interprétabilité le plus récent` pour voir un résumé formaté avec des liens rapides pour ouvrir les différents éléments.

---

## Premiers pas

Pour un guide étape par étape, consultez [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

---

## Contrat et documentation

### Documents principaux

| Document | Objectif |
|----------|---------|
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | Comment RunForge établit la confiance |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | Visite guidée de 2 à 3 minutes |
| [CONTRACT.md](CONTRACT.md) | Contrat comportemental complet |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | Règles d'extension de la phase 3 |

### Phase 2 (figée)

| Document | Portée |
|----------|-------|
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | Observabilité |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | Introspection |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | Améliorations de l'interface utilisateur |

### Phase 3 (figée à partir de la version v0.3.6.0)

| Document | Portée |
|----------|-------|
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | Sélection du modèle |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | Hyperparamètres et profils |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | Métriques spécifiques aux modèles |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | Importance des caractéristiques |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | Coefficients linéaires |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | Indice d'interprétabilité |

### Avenir

Consultez [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) pour connaître les améliorations prévues.

---

## Statut de la phase

| Phase | Objectif | Statut |
|-------|-------|--------|
| **Phase 2** | Formation de base, observabilité | Figée |
| **Phase 3** | Sélection de modèle, interprétabilité | **Frozen (v0.3.6.0)** |
| **Phase 4** | Cycle de vie, récupération, doctrine | **Publiée (v1.1.0)** — voir [`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) |

**Toutes les interfaces du contrat des phases 2, 3 et 4 sont verrouillées. Les travaux futurs nécessitent un contrat de phase 5.**

---

## Licence

MIT

---

Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
