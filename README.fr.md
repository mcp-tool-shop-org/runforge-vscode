<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  
            <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/runforge-vscode/readme.png"
           alt="RunForge Logo" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/runforge-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/runforge-vscode/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.runforge"><img src="https://img.shields.io/visual-studio-marketplace/v/mcp-tool-shop.runforge.svg" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/runforge-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

Formation de modèles d'apprentissage automatique (ML) simplifiée, avec un comportement déterministe et basé sur des contrats.

La phase 3 (fonctionnalités et interprétabilité) est terminée avec la version 0.3.6.0.
Les travaux futurs se déroulent dans le cadre des contrats de la phase 4.

---

## 🛡️ La garantie RunForge

RunForge est un logiciel conçu pour remplacer l'expression "ça marche sur ma machine" par une certitude basée sur une analyse approfondie.

### Ce que nous garantissons
1.  **Déterminisme :** Chaque exécution est initialisée avec une valeur de départ spécifique. Relancer la même configuration avec la même valeur de départ sur les mêmes données produit exactement le même modèle.
2.  **Traçabilité :** Chaque enregistrement `run.json` inclut le SHA du commit Git, le chemin d'accès à l'interpréteur Python et la version de l'extension utilisés. Vous pouvez retracer tout modèle jusqu'au code qui l'a généré.
3.  **Auditabilité :** Les artefacts (modèles, métriques, journaux) sont enregistrés sur le disque dans des formats standard (JSON, joblib). Il n'y a pas de bases de données cachées, ni de dépendances cloud.

### Ce que ce n'est pas
- **Ce n'est pas un outil AutoML magique :** Nous ne devinons pas ce que vous voulez. Nous utilisons des configurations spécifiques et personnalisables.
- **Ce n'est pas une plateforme cloud :** Nous ne transmettons vos données nulle part. Tout se déroule localement, dans votre espace de travail VS Code.

Pour plus d'informations sur le modèle de confiance complet, veuillez consulter le document [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md).

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
.runforge/runs/<run-id>/
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

| Commande. | Description. |
| Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. |
| `RunForge: Train (Standard)` | Exécuter l'entraînement en utilisant le paramètre prédéfini "std-train". |
| `RunForge: Train (High Quality)` | Exécutez l'entraînement en utilisant le paramètre prédéfini "hq-train". |
| `RunForge: Open Runs` | Consulter les séances d'entraînement terminées. |
| `RunForge: Inspect Dataset` | Valider l'ensemble de données avant l'entraînement (version 0.2.2.1 et suivantes). |
| `RunForge: Open Latest Run Metadata` | Consulter les métadonnées de la dernière exécution (version 0.2.2.1 et suivantes). |
| `RunForge: Inspect Model Artifact` | Afficher la structure du pipeline du fichier modèle.pkl (version 0.2.2.2 et suivantes). |
| `RunForge: Browse Runs` | Consulter tous les cycles d'exécution avec les actions associées (résumé, diagnostics, artefacts) (version 0.2.3 et suivantes). |
| `RunForge: View Latest Metrics` | Consultez les métriques détaillées disponibles dans le fichier metrics.v1.json (version 0.3.3 et suivantes). |
| `RunForge: View Latest Feature Importance` | Visualisation de l'importance des caractéristiques pour les modèles RandomForest (version 0.3.4 et suivantes). |
| `RunForge: View Latest Linear Coefficients` | Afficher les coefficients des modèles linéaires (version 0.3.5 et suivantes). |
| `RunForge: View Latest Interpretability Index` | Consulter l'index unifié de tous les éléments relatifs à l'interprétabilité (version 0.3.6 et suivantes). |
| `RunForge: Export Latest Run as Markdown` | Enregistrer un résumé formaté au format Markdown de la dernière exécution (version 0.4.3 et suivantes). |

## Utilisation

1. Définissez la variable d'environnement `RUNFORGE_DATASET` en spécifiant le chemin vers votre fichier CSV.
2. Le fichier CSV doit comporter une colonne nommée `label`.
3. Lancez l'entraînement via la palette de commandes.

---

## Garanties (version 0.2.1 et suivantes)

RunForge VS Code offre une formation en apprentissage automatique (ML) déterministe et basée sur des contrats. Les garanties mentionnées ci-dessous sont intentionnelles et sont vérifiées par des tests.

### Déterminisme

Compte tenu du même ensemble de données, de la même configuration et de la même version de RunForge :

- Les ensembles d'entraînement et de validation sont identiques pour toutes les exécutions.
- Les résultats générés sont reproductibles.
- Les mesures de performance sont stables.

Il n'existe pas d'aléatoire en dehors des comportements qui sont explicitement programmés pour être aléatoires.

### Gestion des étiquettes

- La colonne d'étiquettes est spécifiée de manière explicite.
- L'étiquette n'est jamais déduite de la position de la colonne.
- Les étiquettes mal configurées ou manquantes entraînent des erreurs dès le début.

### Contrat de performance

La formation produit exactement trois indicateurs de performance :

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

Aucun champ supplémentaire n'est ajouté implicitement.
L'extension du schéma nécessite une modification contractuelle versionnée.

### Artefacts du modèle

- `model.pkl` est toujours une version sérialisée de `sklearn.Pipeline`.
- Toutes les étapes de prétraitement (par exemple, la normalisation) sont intégrées.
- L'artefact est autonome et prêt à être utilisé pour l'inférence.

Aucune étape de prétraitement externe n'est nécessaire.

### Données manquantes

- Les lignes contenant des valeurs manquantes sont supprimées de manière systématique.
- Le nombre de lignes supprimées est enregistré.
- Aucune imputation implicite n'est effectuée.

### Source de vérité

- Toute la logique d'exécution Python se trouve dans le répertoire `python/ml_runner/`.
- Il n'y a pas de code dupliqué ni d'implémentations alternatives.
- Les tests garantissent la cohérence entre le comportement de TypeScript et de Python.

### Politique de stabilité

- Le comportement de la version v0.2.1 est figé.
- Les modifications qui entraînent une rupture de compatibilité nécessitent une mise à jour de la version principale.
- Les modifications de comportement non signalées sont considérées comme des bogues.

---

## Buts non marqués (intentionnels)

RunForge ne tente actuellement pas de :

- Sélection automatique des modèles (l'utilisateur doit choisir explicitement).
- Ajustement des hyperparamètres (les valeurs par défaut sont fixes pour chaque configuration).
- Possibilité de réaliser un entraînement en ligne ou incrémental.
- Masquage du comportement de l'entraînement par des règles heuristiques.

La rigueur et la transparence sont prioritaires par rapport à l'automatisation.

---

---

## Observabilité (version 0.2.2.1 et suivantes)

La phase 2.2.1 ajoute une fonctionnalité de suivi des sessions d'entraînement sans modifier le comportement de l'entraînement lui-même.

### Exécuter les métadonnées

Chaque session d'entraînement génère un fichier `run.json` contenant les informations suivantes :

- Identifiant de l'exécution et horodatage.
- Empreinte numérique de l'ensemble de données (SHA-256).
- Colonne des étiquettes et nombre de caractéristiques.
- Nombre de lignes supprimées.
- Aperçu des métriques.
- Chemins des artefacts.

### Inspection des données

Vérifiez les ensembles de données avant de commencer l'entraînement.

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Retourne les noms des colonnes, le nombre de lignes, le nombre de caractéristiques et effectue la validation des étiquettes.

### Suivi de l'origine

Toutes les exécutions sont indexées dans le fichier `.runforge/index.json` pour assurer la traçabilité :

- À partir d'un fichier `model.pkl`, retrouver les métadonnées de l'exécution.
- Rechercher toutes les exécutions correspondant à une empreinte numérique (fingerprint) donnée d'un ensemble de données.
- Index en écriture seule (ne permet ni le réarrangement ni la suppression).

---

## Introspection des artefacts (version 0.2.2.2 et suivantes)

La phase 2.2.2 ajoute une fonctionnalité permettant d'examiner les éléments générés par l'apprentissage, mais en lecture seule.

L'inspection est en lecture seule et ne permet ni de réentraîner les modèles, ni de modifier les données.

### Inspection des canalisations

Inspectez le contenu d'un fichier `model.pkl` sans avoir à le réentraîner.

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Renvoie une structure JSON contenant :

- Étapes du processus (dans l'ordre)
- Types d'étapes et modules
- Détection préalable.

```
The quick brown fox jumps over the lazy dog.
Le rapide renard brun saute par-dessus le chien paresseux.
```

Now translate this:

"The company announced a new partnership with a leading technology firm. This collaboration will focus on developing innovative solutions for the healthcare sector. The CEO expressed his enthusiasm for this new venture and its potential to revolutionize the industry."
```
L'entreprise a annoncé un nouveau partenariat avec une entreprise technologique de premier plan. Cette collaboration sera axée sur le développement de solutions innovantes pour le secteur de la santé. Le PDG a exprimé son enthousiasme pour cette nouvelle initiative et son potentiel de révolutionner le secteur.
```

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

| Code | Description. |
| Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. |
| `MISSING_VALUES_DROPPED` | Lignes supprimées en raison de valeurs manquantes. |
| `LABEL_NOT_FOUND` | La colonne "label" n'est pas présente dans l'ensemble de données. |
| `LABEL_TYPE_INVALID` | La colonne "Label" a un type de données invalide. |
| `ZERO_ROWS` | L'ensemble de données ne contient aucune ligne après le traitement. |
| `ZERO_FEATURES` | L'ensemble de données ne contient aucune colonne de caractéristiques. |
| `LABEL_ONLY_DATASET` | L'ensemble de données ne contient que la colonne des étiquettes. |

Tous les diagnostics sont au format JSON, ce qui permet une lecture automatique par les machines (pas besoin d'analyse de fichiers journaux).

---

## Parcourir les parcours (version 0.2.3 et suivantes)

La phase 2.3 ajoute un navigateur de sessions unifié avec des actions rapides.

### Utilisation des exécutions de navigation

1. Ouvrez la palette de commandes (Ctrl+Shift+P).
2. Exécutez la commande `RunForge: Parcourir les exécutions`.
3. Sélectionnez une exécution dans la liste (les plus récentes en premier).
4. Choisissez une action :
- **Ouvrir le résumé de l'exécution** — Afficher les métadonnées de l'exécution au format Markdown lisible.
- **Afficher les diagnostics** — Consulter les événements qui se sont produits pendant l'exécution.
- **Examiner les artefacts du modèle** — Visualiser la structure du pipeline.
- **Copier l'empreinte du jeu de données** — Copier la valeur SHA-256 dans le presse-papiers.

### Diagnostics synthétiques

Les diagnostics sont extraits des champs du fichier run.json :

| Condition. | Diagnostic. |
| Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | Veuillez fournir le texte à traduire. |
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

Des diagnostics structurés et complets concernant les émissions sont prévus pour les phases ultérieures.

---

## Sélection du modèle (version 0.3.1 et suivantes)

La phase 3.1 ajoute une sélection explicite du modèle, tout en conservant toutes les garanties de la phase 2.

### Modèles compatibles

| Model | Valeur CLI. | Description. |
| Veuillez fournir le texte à traduire. | Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. |
| Régression logistique. | `logistic_regression` | Par défaut, rapide, interprétable. |
| Forêt aléatoire. | `random_forest` | Ensemble permet de traiter des motifs non linéaires. |
| SVC linéaire. | `linear_svc` | Classificateur à vecteurs de support, basé sur la marge. |

### Configuration

Configure la famille de modèles dans les paramètres de VS Code :

```json
{
  "runforge.modelFamily": "random_forest"
}
```

Vous pouvez également utiliser l'interface de configuration : recherchez "Famille de modèles RunForge" et sélectionnez-la dans la liste déroulante.

### Utilisation de l'interface en ligne de commande

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

L'argument `--model` est facultatif. La valeur par défaut est : `logistic_regression`.

### Origine

Le modèle familial sélectionné est enregistré dans le fichier `run.json` :

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Compatibilité descendante

- Toutes les exécutions de la phase 2 restent lisibles.
- Le comportement par défaut n'a pas été modifié (régression logistique).
- Aucune migration n'est nécessaire.
- Le prétraitement reste inchangé (StandardScaler pour tous les modèles).

---

## Hyperparamètres et profils de formation (version 0.3.2 et suivantes)

La phase 3.2 introduit un contrôle explicite des hyperparamètres et des profils de formation.

### Profils de formation

Les profils prédéfinis offrent des hyperparamètres configurés à l'avance.

| Profil. | Description. | Modèle de famille. |
| Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. |
| `default` | Aucune surcharge de paramètre. | (utilise le contexte) |
| `fast` | Nombre d'itérations réduit pour des exécutions rapides. | régression logistique |
| `thorough` | Davantage d'arbres/d'itérations pour une meilleure qualité. | forêt aléatoire |

Configurer dans les paramètres de VS Code :
```json
{
  "runforge.profile": "fast"
}
```

### Hyperparamètres de l'interface en ligne de commande (CLI)

Modifier les hyperparamètres individuels via l'interface en ligne de commande :

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Règles de priorité

Lorsque les paramètres du profil et les paramètres de l'interface de ligne de commande sont tous les deux définis :

1. **Paramètres spécifiés via l'interface en ligne de commande (CLI) --param** (priorité la plus élevée)
2. **Paramètres étendus à partir du profil**
3. **Paramètres par défaut du modèle** (priorité la plus faible)

### Origine

Les hyperparamètres et les profils sont enregistrés dans le fichier `run.json` :

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

Lorsqu'aucun profil n'est utilisé, les champs du profil sont complètement omis (ils ne sont pas définis comme "null").

---

## Métriques spécifiques aux modèles (version 0.3.3 et suivantes)

La phase 3.3 introduit des métriques détaillées et spécifiques à chaque modèle, ainsi qu'une sélection de profils basée sur les capacités.

### Profils de mesures

Les profils de métriques sont sélectionnés automatiquement en fonction des capacités du modèle :

| Profil. | Description. | Métriques. |
| Veuillez fournir le texte à traduire. | Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | Veuillez fournir le texte à traduire. |
| `classification.base.v1` | Tous les classificateurs. | précision, exactitude, rappel, score F1, matrice de confusion. |
| `classification.proba.v1` | Binaire + probabilité prédite. | base + ROC-AUC, perte logistique. |
| `classification.multiclass.v1` | 3 classes ou plus. | base + précision/rappel/score F1 par classe. |

### Logique de sélection des profils

- Classification binaire + `predict_proba` → `classification.proba.v1`
- Classification multiclasse (3 classes ou plus) → `classification.multiclass.v1`
- Dans les autres cas → `classification.base.v1`

### Capacités du modèle

| Model | predict_proba | fonction de décision |
| Please provide the English text you would like me to translate. I am ready to translate it into French. | "Please provide the text you would like me to translate." | "The company is committed to providing high-quality products and services."

"We are looking for a motivated and experienced candidate."

"Please submit your application by October 31st."

"For more information, please visit our website."
-------------------
"L'entreprise s'engage à fournir des produits et services de haute qualité."

"Nous recherchons un candidat motivé et expérimenté."

"Veuillez soumettre votre candidature avant le 31 octobre."

"Pour plus d'informations, veuillez consulter notre site web." |
| RégressionLogistique | ✅ | ✅ |
| Forêt aléatoire. | ✅ | ❌ |
| LinearSVC | ❌ | ✅ (Uniquement pour la courbe ROC-AUC) |

### Artefact de mesure

La formation génère désormais les fichiers `metrics.v1.json` et `metrics.json` simultanément.

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

### Exécuter les métadonnées

Le fichier `run.json` inclut désormais un pointeur vers les métriques de version 1.

```json
{
  "schema_version": "run.v0.3.3",
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

### Compatibilité descendante

- Le fichier `metrics.json` (phase 2) reste inchangé.
- Tous les outils existants continuent de fonctionner.
- Les champs de profil dans le fichier `run.json` apparaissent ensemble ou ne sont pas affichés du tout.

---

## Importance des caractéristiques (version 0.3.4 et suivantes)

La version 3.4 ajoute une fonctionnalité permettant d'extraire l'importance des caractéristiques de manière en lecture seule pour les modèles pris en charge.

### Modèles compatibles

L'importance des caractéristiques n'est disponible que pour les modèles qui disposent de signaux d'importance intégrés.

| Model | Soutenu. | Importance : Type. |
| Please provide the English text you would like me to translate. I am ready to translate it into French. | Veuillez fournir le texte à traduire. | -----------------
Vous êtes un traducteur professionnel de l'anglais vers le français. Votre objectif est de transmettre avec précision le sens et les nuances du texte anglais original, tout en respectant la grammaire, le vocabulaire et les sensibilités culturelles françaises.
Veuillez produire uniquement la traduction française, sans aucun commentaire ou explication supplémentaire. Veuillez traduire le texte anglais suivant en français :

----------------- |
| Forêt aléatoire. | ✅ | Importance de l'indice de Gini. |
| RégressionLogistique | ❌ | Non disponible dans la version 1. |
| LinearSVC | ❌ | Non disponible dans la version 1. |

**Pas de compromis :** Si le modèle ne prend pas en charge la notion d'importance native, aucun artefact n'est généré.

### Importance des caractéristiques, artefact

Les exécutions de RandomForest génèrent le fichier `artifacts/feature_importance.v1.json` :

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

### Exécuter les métadonnées

Le fichier `run.json` inclut, lorsque cela est possible, des informations sur l'importance des différentes caractéristiques.

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

Lorsque l'importance des caractéristiques n'est pas disponible, ces champs sont complètement omis (ils ne sont pas renseignés).

### Diagnostics

Les modèles non pris en charge émettent des diagnostics structurés :

| Code | Description. |
| "Please provide the English text you would like me to translate." | Veuillez fournir le texte à traduire. |
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | Ce modèle ne prend pas en charge la fonctionnalité native d'importance des variables. |
| `FEATURE_NAMES_UNAVAILABLE` | Les noms des fonctionnalités n'ont pas pu être résolus. |

### Non pris en charge dans la version 1

Les éléments suivants sont explicitement exclus du périmètre de la version 1 :

- Importance basée sur les coefficients pour les modèles linéaires.
- Explications SHAP/LIME.
- Importance par permutation.
- Graphiques de dépendance partielle.

### Paramètres hyperparamètres pris en charge

**Régression logistique :**
- `C` (flottant, > 0) : Intensité de la régularisation.
- `max_iter` (entier, > 0) : Nombre maximal d'itérations.
- `solver` (chaîne de caractères) : Algorithme d'optimisation.
- `warm_start` (booléen) : Réutiliser la solution précédente.

**Forêt aléatoire :**
- `n_estimators` (entier, > 0) : Nombre d'arbres.
- `max_depth` (entier ou None) : Profondeur maximale des arbres.
- `min_samples_split` (entier, >= 2) : Nombre minimal d'échantillons pour effectuer une division.
- `min_samples_leaf` (entier, > 0) : Nombre minimal d'échantillons par feuille.

**SVC linéaire :**
- `C` (flottant, > 0) : Intensité de la régularisation.
- `max_iter` (entier, > 0) : Nombre maximal d'itérations.

---

## Coefficients linéaires (version 0.3.5 et suivantes)

La phase 3.5 ajoute une fonctionnalité d'extraction de coefficients en lecture seule pour les classificateurs linéaires.

### Modèles compatibles

Les coefficients linéaires sont disponibles pour les modèles qui possèdent un attribut natif `coef_` :

| Model | Soutenu. | Type de coefficient. |
| Please provide the English text you would like me to translate. I am ready to translate it into French. | Veuillez fournir le texte à traduire. | "The quick brown fox jumps over the lazy dog."
------------------
"Le rapide renard brun saute par-dessus le chien paresseux." |
| RégressionLogistique | ✅ | Coefficients de log-cotes. |
| LinearSVC | ✅ | Coefficients de la machine à vecteurs de support (SVM). |
| Forêt aléatoire. | ❌ | Utilisez plutôt l'importance des caractéristiques. |

**Pas de compromis :** Si le modèle ne prend pas en charge les coefficients natifs, aucun artefact n'est généré.

### Espace des coefficients (IMPORTANT)

Tous les coefficients sont exprimés dans un espace de caractéristiques normalisé.

Cela signifie :
- Les coefficients correspondent aux caractéristiques APRÈS l'application de la normalisation StandardScaler.
- Les valeurs représentent l'influence pour chaque augmentation d'une écart-type.
- Aucune tentative n'est faite pour "inverser" la normalisation et revenir aux unités de mesure originales des caractéristiques.
- La comparaison des coefficients entre différentes caractéristiques est pertinente (même échelle).
- La comparaison des coefficients aux valeurs originales des caractéristiques N'EST PAS pertinente.

### Artefact dû aux coefficients linéaires

Les exécutions du modèle linéaire génèrent le fichier `artifacts/linear_coefficients.v1.json` :

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

### Support pour plusieurs classes

Pour la classification multiclasse (avec 3 classes ou plus), les coefficients sont regroupés par classe :

- Chaque classe possède son propre ensemble de coefficients.
- Les étiquettes des classes sont triées de manière déterministe.
- Aucune agrégation entre les classes dans la version 1.

### Exécuter les métadonnées

Le fichier `run.json` inclut, si disponible, les coefficients linéaires de référence.

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

Lorsque les coefficients ne sont pas disponibles, ces champs sont entièrement omis (ils ne sont pas renseignés).

### Diagnostics

Les modèles non pris en charge émettent des diagnostics structurés :

| Code | Description. |
| Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. |
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | Ce modèle ne prend pas en charge l'extraction des coefficients. |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | L'objet Classifier ne possède pas d'attribut nommé "coef". |
| `FEATURE_NAMES_UNAVAILABLE` | Les noms des fonctionnalités n'ont pas pu être résolus. |

### Importance des caractéristiques par rapport aux coefficients linéaires

| Artefact. | Modèles compatibles. | Ce que cela révèle. |
| Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | "The quick brown fox jumps over the lazy dog."
------------------
"Le rapide renard brun saute par-dessus le chien paresseux." | "Please provide the text you would like me to translate." |
| Importance des caractéristiques (version 0.3.4) | Forêt aléatoire. | Importance de Gini (basée sur les arbres). |
| Coefficients linéaires (version 0.3.5). | LogisticRegression, LinearSVC. | Coefficients du modèle. |

Voici des approches complémentaires :
- Utilisez l'importance des caractéristiques pour les modèles d'ensemble.
- Utilisez les coefficients linéaires pour les modèles linéaires interprétables.

### Guide d'interprétation

Pour la régression logistique (binaire) :
- Coefficient positif : Augmentation de la caractéristique → Probabilité plus élevée de la classe positive.
- Coefficient négatif : Augmentation de la caractéristique → Probabilité plus faible de la classe positive.
- Amplitude : Valeur absolue plus grande = Influence plus forte.

Exemple : `coefficient = 2.0` signifie +1 écart-type pour cette caractéristique → +2.0 pour les log-cotes.

---

## Indice d'interprétabilité (version 0.3.6 et suivantes)

La phase 3.6 ajoute un index unifié qui permet de relier tous les résultats d'interprétation pour une exécution donnée.

### Objectif

L'indice d'interprétabilité répond aux questions suivantes : "Quels sont les résultats d'interprétation disponibles pour cette exécution, quelles sont leurs versions et où se trouvent-ils ?"

Pas de nouveaux calculs, seulement une mise en relation et un résumé des informations existantes.

### Index : artefact

Chaque exécution génère le fichier `artifacts/interpretability.index.v1.json` :

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

- Les artefacts manquants sont **omis** de la liste `available_artifacts` (ils ne sont pas définis comme nuls ou faux).
- L'index indique uniquement la disponibilité si le fichier existe réellement.
- Une exécution minimale (LogisticRegression) produira les éléments `metrics_v1` et `linear_coefficients_v1`.
- Une exécution de RandomForest produira les éléments `metrics_v1` et `feature_importance_v1`.

### Résumé du contenu

Les résumés ne contiennent que des données de référence (sans valeurs numériques répétées).

| Artefact. | Résumé : Contient. |
| Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | ------------------
Vous êtes un traducteur professionnel de l'anglais vers le français. Votre objectif est de transmettre avec précision le sens et les nuances du texte anglais original, tout en respectant la grammaire, le vocabulaire et les sensibilités culturelles françaises.
Veuillez produire uniquement la traduction française, sans aucun commentaire ou explication supplémentaire. Veuillez traduire le texte anglais suivant en français :

------------------ |
| métriques_v1 | `metrics_profile`, `précision` (provenant du fichier run.json) |
| importance_des_variables_v1 | `model_family`, `top_k` (noms uniquement, maximum 5). |
| coefficients_linéaires_v1 | `model_family`, `num_classes`, `top_k_by_class` (noms uniquement) |

### Commande VS Code

Utilisez la fonction « RunForge : Afficher l'indice d'interprétabilité le plus récent » pour consulter un résumé structuré avec des liens rapides permettant d'ouvrir chaque élément individuellement.

---

## Premiers pas

Pour un guide pas à pas, veuillez consulter le document [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

---

## Contrats et documentation

### Documents essentiels

| Document. | Objectif. |
| Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | Veuillez fournir le texte à traduire. |
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | Comment RunForge établit-il la confiance ? |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | Visite guidée d'une durée de 2 à 3 minutes. |
| [CONTRACT.md](CONTRACT.md) | Contrat de comportement complet. |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | Règles d'extension pour la phase 3. |

### Phase 2 (Gelée)

| Document. | Scope |
| Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | Please provide the English text you would like me to translate. I am ready to translate it into French. |
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | Observabilité. |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | Introspection. |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | Amélioration de l'expérience utilisateur. |

### Phase 3 (fonctionnalités figées à la version 0.3.6.0)

| Document. | Scope |
| Bien sûr, veuillez me fournir le texte que vous souhaitez que je traduise. | Please provide the English text you would like me to translate. I am ready to translate it into French. |
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | Sélection du modèle. |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | Hyperparamètres et profils. |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | Métriques tenant compte du modèle. |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | Importance des caractéristiques. |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | Coefficients linéaires. |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | Indice d'interprétabilité. |

### Futur

Consultez le document [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) pour connaître les améliorations prévues.

---

## Statut de la phase

| Phase | Focus | Statut. |
| Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. | Veuillez fournir le texte à traduire. |
| **Phase 2** | Formation de base, observabilité. | Congelé. |
| **Phase 3** | Sélection de modèles, interprétabilité. | **Frozen (v0.3.6.0)** |
| **Phase 4** | TBD | Nécessite un nouveau contrat. |

Toutes les garanties des phases 2 et 3 sont désormais définitives. Les travaux futurs nécessitent des contrats de phase 4.

---

## Licence

MIT.
