<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/runforge-vscode/readme.png" alt="RunForge Logo" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/runforge-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/runforge-vscode/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://codecov.io/gh/mcp-tool-shop-org/runforge-vscode"><img src="https://codecov.io/gh/mcp-tool-shop-org/runforge-vscode/branch/main/graph/badge.svg" alt="Coverage"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.runforge"><img src="https://img.shields.io/badge/marketplace-v1.1.0-blue" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/runforge-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

> **Avviso per gli utenti del Marketplace nella versione 1.0.1 (rilasciata il 25 marzo 2026):** La versione 1.0.1 conteneva cinque
> bug CRITICI che compromettevano i comandi "Train", la navigazione e le visualizzazioni di monitoraggio
> (la causa principale era un errore nell'invocazione di un sottoprocesso e una discrepanza tra il percorso e la struttura dati tra il writer e i reader). Tutti e cinque i bug sono stati corretti nella versione **1.1.0**, che include anche le funzionalità della Fase 4
> (cancellazione in corso, ripristino, affidabilità dello spazio di lavoro). Se avete installato la versione 1.0.1,
> vi preghiamo di aggiornare alla versione 1.1.0. Consultate le [note di rilascio della versione 1.0.1](docs/MARKETPLACE_NOTE_v1.0.1.md)
> e il [`CHANGELOG.md`](CHANGELOG.md#110---2026-04-25) per i dettagli.

Addestramento di modelli di machine learning con un'interfaccia semplice e un comportamento deterministico e basato su contratti.

> **La Fase 3 (Funzionalità e interpretabilità) è stata bloccata alla versione 0.3.6.0.
> La Fase 4 (Ciclo di vita e ripristino) è stata rilasciata nella versione 1.1.0** — consultare il [contratto della Fase 4](CONTRACT-PHASE-4.md).

## Novità nella versione 1.1.0

1. **Annullamento dell'addestramento in corso** (`RunForge: Annulla l'addestramento attivo`) — è possibile annullare un addestramento in esecuzione tramite la Command Palette o il pulsante di annullamento della notifica di avanzamento di VS Code. Viene fornito un periodo di grazia di 5 secondi con il segnale SIGTERM, seguito da SIGKILL. Le esecuzioni annullate vengono contrassegnate con un flag `.cancelled` in modo che il ripristino e il selettore di esecuzioni possano classificarle correttamente.
2. **Ripristino dell'indice** (`RunForge: Ripristina l'indice`) — analizza la directory `.ml/runs/` e riaggiunge eventuali esecuzioni mancanti dal file `.ml/outputs/index.json`. Operazione idempotente. Utile dopo un errore di scrittura o uno spostamento dello spazio di lavoro.
3. **Protezione dell'affidabilità dello spazio di lavoro** — l'avvio di un sottoprocesso Python richiede ora `vscode.workspace.isTrusted`. Gli spazi di lavoro non affidabili visualizzano un errore "SafeError" che rimanda all'interfaccia di gestione dell'affidabilità dello spazio di lavoro.
4. **Notifiche di avanzamento per epoca** — l'addestramento mostra l'avanzamento in tempo reale e visualizza un pulsante di annullamento tramite `vscode.window.withProgress`.
5. **Messaggi di errore CSV migliorati** — delimitatori diversi dalla virgola, codifiche diverse da UTF-8, etichette composte interamente da valori NaN, file CSV con una sola colonna e file CSV con solo intestazioni: per ciascuno di questi casi, vengono visualizzate informazioni diagnostiche specifiche e utili, invece di messaggi di errore di pandas poco chiari.
6. **Regole ESLint personalizzate** che applicano i principi architetturali codificati in
[`docs/CONTRACTS.md`](docs/CONTRACTS.md) (nessuna duplicazione di valori canonici, nessun tipo "shadow" nei moduli consumer).
7. **Documentazione dei principi** — [`docs/CONTRACTS.md`](docs/CONTRACTS.md) codifica ora le sei regole architetturali + sette modelli operativi derivanti da cinque cicli di audit strutturati. I modelli sono inderogabili per qualsiasi attività che coinvolga domini diversi (TS / Python / monitoraggio).

Inoltre, la versione 1.1.0 risolve tutti e cinque i bug CRITICI della versione 1.0.1 (`F-COORD-003`, `F-COORD-004`,
`F-COORD-008`, `F-COORD-010`, `F-COORD-011`). Consultare il [`CHANGELOG.md`](CHANGELOG.md) per
la descrizione completa.

---

## 🛡️ La garanzia RunForge

RunForge è un software con una visione specifica, progettato per sostituire la frase "funziona sulla mia macchina" con una certezza forense.

### Cosa garantiamo
1.  **Determinismo**: Ogni esecuzione è "seedata". L'esecuzione ripetuta della stessa configurazione con la stessa "seed" sugli stessi dati produce esattamente lo stesso modello.
2.  **Provenienza**: Ogni record `run.json` include l'hash SHA del commit Git, il percorso dell'interprete Python e la versione dell'estensione utilizzati. È possibile risalire a qualsiasi modello al codice che lo ha creato.
3.  **Auditabilità**: Gli artefatti (modelli, metriche, log) vengono salvati su disco in formati standard (JSON, joblib). Nessun database nascosto, nessuna dipendenza dal cloud.

### Cosa non è
-   **Non è uno strumento AutoML magico**: Non indoviniamo cosa vuoi. Eseguiamo configurazioni specifiche e regolabili.
-   **Non è una piattaforma cloud**: Non inviamo i tuoi dati da nessuna parte. Tutto avviene localmente nel tuo spazio di lavoro VS Code.

Per il modello di affidabilità completo, consultare [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md).

### Sicurezza e ambito dei dati

**Dati a cui si accede:** file CSV nell'area di lavoro (solo in lettura per l'addestramento), directory `.ml/` (metadati dell'esecuzione, artefatti del modello, file JSON delle metriche), output standard/errori standard dei processi Python. **Dati a cui NON si accede:** nessun file al di fuori dell'area di lavoro, nessun dato del browser, nessuna credenziale del sistema operativo. **Autorizzazioni richieste:** accesso in lettura/scrittura al file system all'interno dell'area di lavoro, esecuzione di processi Python. **Nessuna connessione di rete in uscita**: tutte le operazioni sono locali. **Nessun dato di telemetria** viene raccolto o trasmesso.

### Ciclo di vita di un'esecuzione

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

## Installazione

```bash
npm install
npm run compile
```

## Comandi

| Comando | Descrizione |
|---------|-------------|
| `RunForge: Train (Standard)` | Esegui l'addestramento con il preset "std-train" |
| `RunForge: Train (High Quality)` | Esegui l'addestramento con il preset "hq-train" |
| `RunForge: Open Runs` | Visualizza le esecuzioni di addestramento completate |
| `RunForge: Inspect Dataset` | Valida il set di dati prima dell'addestramento (v0.2.2.1+) |
| `RunForge: Open Latest Run Metadata` | Visualizza i metadati dell'ultima esecuzione (v0.2.2.1+) |
| `RunForge: Inspect Model Artifact` | Visualizza la struttura del pipeline di model.pkl (v0.2.2.2+) |
| `RunForge: Browse Runs` | Esplora tutte le esecuzioni con le azioni (riepilogo, diagnostica, artefatto) (v0.2.3+) |
| `RunForge: View Latest Metrics` | Visualizza le metriche dettagliate dal file metrics.v1.json (v0.3.3+) |
| `RunForge: View Latest Feature Importance` | Visualizza l'importanza delle caratteristiche per i modelli RandomForest (v0.3.4+) |
| `RunForge: View Latest Linear Coefficients` | Visualizza i coefficienti per i modelli lineari (v0.3.5+) |
| `RunForge: View Latest Interpretability Index` | Visualizza l'indice unificato di tutti gli artefatti di interpretabilità (v0.3.6+) |
| `RunForge: Export Latest Run as Markdown` | Salva un riepilogo formattato in Markdown dell'ultima esecuzione (v0.4.3+) |

## Utilizzo

1. Imposta la variabile d'ambiente `RUNFORGE_DATASET` sul percorso del tuo file CSV.
2. Il file CSV deve avere una colonna denominata `label`.
3. Esegui l'addestramento tramite la Command Palette.

---

## Garanzie (v0.2.1+)

RunForge VS Code fornisce un addestramento di modelli deterministico e basato su specifiche contrattuali. Le garanzie riportate di seguito sono intenzionali e verificate tramite test.

### Determinismo

Dato lo stesso set di dati, la stessa configurazione e la stessa versione di RunForge:

- Le divisioni di addestramento/validazione sono identiche tra le esecuzioni.
- Gli artefatti generati sono riproducibili.
- Gli output delle metriche sono stabili.

Non esiste casualità al di fuori di comportamenti esplicitamente definiti.

### Gestione delle etichette

- La colonna delle etichette è specificata esplicitamente.
- L'etichetta non viene mai dedotta in base alla posizione della colonna.
- Le etichette configurate in modo errato o mancanti causano un errore immediato.

### Contratto delle metriche

L'addestramento produce esattamente tre metriche:

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

Nessun altro campo viene aggiunto implicitamente.
L'espansione dello schema richiede una modifica contrattuale con versione.

### Artefatti del modello

- `model.pkl` è sempre una istanza serializzata di `sklearn.Pipeline`.
- Tutte le fasi di pre-elaborazione (ad esempio, la normalizzazione) sono incluse.
- L'artefatto è autonomo e pronto per l'inferenza.

Non sono necessarie fasi di pre-elaborazione esterne.

### Dati mancanti

- Le righe contenenti valori mancanti vengono eliminate in modo deterministico.
- Il numero di righe eliminate viene registrato.
- Non viene eseguita alcuna imputazione implicita.

### Fonte della verità

- Tutta la logica di esecuzione Python risiede in `python/ml_runner/`.
- Non esistono implementazioni duplicate o alternative.
- I test verificano la coerenza tra il comportamento di TypeScript e Python.

### Politica di stabilità

- Il comportamento della versione v0.2.1 è bloccato.
- Le modifiche che causano interruzioni richiedono un aumento esplicito della versione principale.
- Le modifiche del comportamento non documentate sono considerate bug.

---

## Obiettivi non previsti (intenzionali)

RunForge attualmente non tenta di:

- Selezionare automaticamente i modelli (l'utente deve scegliere esplicitamente).
- Ottimizzare gli iperparametri (i valori predefiniti sono fissi per ogni preset).
- Eseguire l'addestramento online o incrementale.
- Nascondere il comportamento dell'addestramento dietro euristiche.

La correttezza e la trasparenza hanno la priorità sull'automazione.

---

---

## Osservabilità (v0.2.2.1+)

La versione 2.2.1 aggiunge la visibilità sulle esecuzioni di addestramento senza modificare il comportamento dell'addestramento.

### Metadati dell'esecuzione

Ogni esecuzione di addestramento genera un file `run.json` contenente:

- ID dell'esecuzione e timestamp
- Impronta digitale del dataset (SHA-256)
- Colonna delle etichette e numero di feature
- Numero di righe eliminate
- Snapshot delle metriche
- Percorsi degli artefatti

### Ispezione del dataset

Ispezionare i dataset prima dell'addestramento:

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Restituisce i nomi delle colonne, il numero di righe, il numero di feature e la validazione delle etichette.

### Tracciabilità

Tutte le esecuzioni sono indicizzate in `.ml/outputs/index.json` per la tracciabilità:

- Dato un file `model.pkl`, è possibile risalire ai metadati dell'esecuzione.
- È possibile trovare tutte le esecuzioni per una determinata impronta digitale del dataset.
- L'indice è modificabile solo in aggiunta (non viene mai riordinato o eliminato).

---

## Ispezione degli artefatti (v0.2.2.2+)

La fase 2.2.2 aggiunge l'ispezione in sola lettura degli artefatti addestrati.

**L'ispezione è in sola lettura e non riaddestra né modifica gli artefatti.**

### Ispezione della pipeline

Esaminare il contenuto di un file `model.pkl` senza riaddestrare:

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Restituisce un JSON strutturato contenente:

- Passaggi della pipeline (in ordine)
- Tipi di passaggio e moduli
- Rilevamento della pre-elaborazione

Esempio di output:

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

### Diagnostica

La diagnostica strutturata spiega perché un'esecuzione si è comportata in un determinato modo:

| Codice | Descrizione |
|------|-------------|
| `MISSING_VALUES_DROPPED` | Righe eliminate a causa di valori mancanti |
| `LABEL_NOT_FOUND` | Colonna delle etichette non presente nel dataset |
| `LABEL_TYPE_INVALID` | Colonna delle etichette con tipo non valido |
| `ZERO_ROWS` | Il dataset non contiene righe dopo l'elaborazione |
| `ZERO_FEATURES` | Il dataset non contiene colonne di feature |
| `LABEL_ONLY_DATASET` | Il dataset contiene solo la colonna delle etichette |

Tutta la diagnostica è in formato JSON leggibile dalla macchina (non è necessario analizzare i log).

---

## Esplorazione delle esecuzioni (v0.2.3+)

La fase 2.3 aggiunge un browser di esecuzioni unificato con azioni rapide.

### Utilizzo del browser di esecuzioni

1. Aprire la palette dei comandi (`Ctrl+Shift+P`)
2. Eseguire `RunForge: Esplora le esecuzioni`
3. Selezionare un'esecuzione dall'elenco (dalla più recente alla più vecchia)
4. Scegliere un'azione:
- **Apri riepilogo dell'esecuzione** — Visualizzare i metadati dell'esecuzione in formato Markdown leggibile
- **Visualizza diagnostica** — Vedere cosa è successo durante l'esecuzione
- **Ispeziona artefatto del modello** — Visualizzare la struttura della pipeline
- **Copia impronta digitale del dataset** — Copiare l'hash SHA-256 negli appunti

### Diagnostica sintetizzata

La diagnostica è derivata dai campi del file `run.json`:

| Condizione | Diagnostica |
|-----------|------------|
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

L'emissione completa della diagnostica strutturata è prevista per le fasi future.

---

## Selezione del modello (v0.3.1+)

La fase 3.1 aggiunge la selezione esplicita del modello, preservando al contempo tutte le garanzie della fase 2.

### Modelli supportati

| Modello | Valore CLI | Descrizione |
|-------|-----------|-------------|
| Regressione logistica | `logistic_regression` | Predefinito, veloce, interpretabile |
| Random Forest | `random_forest` | Ensemble, gestisce pattern non lineari |
| Linear SVC | `linear_svc` | Classificatore a vettore di supporto, basato sul margine |

### Configurazione

Impostare la famiglia di modelli nelle impostazioni di VS Code:

```json
{
  "runforge.modelFamily": "random_forest"
}
```

Oppure utilizzare l'interfaccia utente delle impostazioni: cercare "RunForge Model Family" e selezionare dall'elenco a discesa.

### Utilizzo della CLI

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

L'argomento `--model` è facoltativo. Valore predefinito: `logistic_regression`.

### Provenienza

La famiglia di modelli selezionata viene registrata nel file `run.json`:

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Compatibilità con le versioni precedenti

- Tutte le esecuzioni della fase 2 rimangono leggibili
- Il comportamento predefinito rimane invariato (regressione logistica)
- Non è necessaria alcuna migrazione
- La pre-elaborazione rimane fissa (StandardScaler per tutti i modelli)

---

## Iperparametri e profili di addestramento (v0.3.2+)

La fase 3.2 aggiunge il controllo esplicito degli iperparametri e dei profili di addestramento.

### Profili di addestramento

I profili predefiniti forniscono parametri preconfigurati:

| Profilo | Descrizione | Famiglia di modelli |
|---------|-------------|--------------|
| `default` | Nessuna sovrascrittura dei parametri | (utilizza l'impostazione) |
| `fast` | Meno iterazioni per esecuzioni rapide | logistic_regression |
| `thorough` | Più alberi/iterazioni per una migliore qualità | random_forest |

Configurare nelle impostazioni di VS Code:
```json
{
  "runforge.profile": "fast"
}
```

### Parametri della riga di comando (CLI)

Sovrascrivere i singoli parametri tramite la riga di comando:

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Regole di precedenza

Quando sia il profilo che i parametri della riga di comando sono impostati:

1. **`--param` della riga di comando** (priorità massima)
2. **Parametri espansi dal profilo**
3. **Valori predefiniti del modello** (priorità minima)

### Provenienza

I parametri e i profili sono registrati in `run.json`:

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

Quando non viene utilizzato alcun profilo, i campi del profilo vengono completamente omessi (non impostati a null).

---

## Metriche specifiche per il modello (v0.3.3+)

La versione 3.3 aggiunge metriche dettagliate e specifiche per il modello, con selezione del profilo basata sulle capacità.

### Profili delle metriche

I profili delle metriche vengono selezionati automaticamente in base alle capacità del modello:

| Profilo | Descrizione | Metriche |
|---------|-------------|---------|
| `classification.base.v1` | Tutti i classificatori | accuratezza, precisione, richiamo, F1, matrice di confusione |
| `classification.proba.v1` | Classificazione binaria + `predict_proba` | base + ROC-AUC, log loss |
| `classification.multiclass.v1` | Più di 2 classi | base + precisione/richiamo/F1 per classe |

### Logica di selezione del profilo

- Classificazione binaria + `predict_proba` → `classification.proba.v1`
- Multiclasse (3+ classi) → `classification.multiclass.v1`
- Altrimenti → `classification.base.v1`

### Capacità del modello

| Modello | `predict_proba` | `decision_function` |
|-------|---------------|-------------------|
| LogisticRegression | ✅ | ✅ |
| RandomForest | ✅ | ❌ |
| LinearSVC | ❌ | ✅ (solo ROC-AUC) |

### Artefatto delle metriche

L'addestramento ora produce `metrics.v1.json` insieme a `metrics.json`:

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

### Metadati dell'esecuzione

`run.json` ora include un puntatore a `metrics_v1`:

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

### Compatibilità con le versioni precedenti

- `metrics.json` (versione 2) rimane invariato
- Tutti gli strumenti esistenti continuano a funzionare
- I campi del profilo in `run.json` appaiono insieme o non appaiono affatto

---

## Importanza delle caratteristiche (v0.3.4+)

La versione 3.4 aggiunge l'estrazione di importanza delle caratteristiche in sola lettura per i modelli supportati.

### Modelli supportati

L'importanza delle caratteristiche è disponibile solo per i modelli con segnali di importanza nativi:

| Modello | Supportato | Tipo di importanza |
|-------|-----------|-----------------|
| RandomForest | ✅ | Importanza di Gini |
| LogisticRegression | ❌ | Non disponibile nella versione 1 |
| LinearSVC | ❌ | Non disponibile nella versione 1 |

**Nessuna approssimazione**: se il modello non supporta l'importanza nativa, non viene generato alcun artefatto.

### Artefatto dell'importanza delle caratteristiche

Le esecuzioni di RandomForest producono `artifacts/feature_importance.v1.json`:

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

### Metadati dell'esecuzione

`run.json` include un riferimento all'importanza delle caratteristiche quando disponibile:

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

Quando l'importanza delle caratteristiche non è disponibile, questi campi vengono completamente omessi (non impostati a null).

### Diagnostica

I modelli non supportati generano diagnostiche strutturate:

| Codice | Descrizione |
|------|-------------|
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | Il modello non supporta l'importanza nativa delle caratteristiche |
| `FEATURE_NAMES_UNAVAILABLE` | I nomi delle caratteristiche non sono riusciti a essere risolti |

### Non supportato nella versione 1

I seguenti elementi sono esplicitamente esclusi dalla versione 1:

- Importanza basata sui coefficienti per i modelli lineari
- Spiegazioni SHAP/LIME
- Importanza tramite permutazione
- Grafici di dipendenza parziale

### Parametri supportati

**Regressione logistica:**
- `C` (float, > 0): Forza di regolarizzazione
- `max_iter` (int, > 0): Numero massimo di iterazioni
- `solver` (str): Solutore di ottimizzazione
- `warm_start` (bool): Riusare la soluzione precedente

**Random Forest:**
- `n_estimators` (int, > 0): Numero di alberi
- `max_depth` (int o None): Profondità massima dell'albero
- `min_samples_split` (int, >= 2): Numero minimo di campioni per la divisione
- `min_samples_leaf` (int, > 0): Numero minimo di campioni per nodo foglia

**Linear SVC:**
- `C` (float, > 0): Forza della regolarizzazione
- `max_iter` (int, > 0): Numero massimo di iterazioni

---

## Coefficienti lineari (v0.3.5+)

La versione 3.5 aggiunge l'estrazione di coefficienti solo in lettura per i classificatori lineari.

### Modelli supportati

I coefficienti lineari sono disponibili per i modelli con l'attributo nativo `coef_`:

| Modello | Supportato | Tipo di coefficiente |
|-------|-----------|------------------|
| LogisticRegression | ✅ | Coefficienti log-odds |
| LinearSVC | ✅ | Coefficienti SVM |
| RandomForest | ❌ | Utilizzare invece l'importanza delle feature |

**Nessuna approssimazione**: Se il modello non supporta i coefficienti nativi, non viene generato alcun file.

### Spazio dei coefficienti (IMPORTANTE)

**Tutti i coefficienti sono nello spazio delle feature STANDARDIZZATE.**

Questo significa:
- I coefficienti corrispondono alle feature DOPO l'applicazione di StandardScaler
- I valori rappresentano l'influenza per ogni aumento di 1 deviazione standard
- Non viene tentata alcuna operazione per "invertire" la scalatura e tornare alle unità originali delle feature
- Il confronto dei coefficienti tra le diverse feature è significativo (stessa scala)
- Il confronto dei coefficienti con i valori originali delle feature NON è significativo

### Artefatto dei coefficienti lineari

L'esecuzione di un modello lineare genera il file `artifacts/linear_coefficients.v1.json`:

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

### Supporto per la classificazione multiclasse

Per la classificazione multiclasse (3 o più classi), i coefficienti sono raggruppati per classe:

- Ogni classe ha il proprio set di coefficienti
- Le etichette delle classi sono ordinate in modo deterministico
- Non viene eseguita alcuna aggregazione tra le classi nella versione 1

### Metadati dell'esecuzione

Il file `run.json` include un riferimento ai coefficienti lineari, se disponibili:

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

Quando i coefficienti non sono disponibili, questi campi vengono completamente omessi (non impostati a null).

### Diagnostica

I modelli non supportati generano diagnostiche strutturate:

| Codice | Descrizione |
|------|-------------|
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | Il modello non supporta l'estrazione dei coefficienti |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | Il classificatore non ha l'attributo `coef_` |
| `FEATURE_NAMES_UNAVAILABLE` | I nomi delle caratteristiche non sono riusciti a essere risolti |

### Importanza delle feature rispetto ai coefficienti lineari

| Artefatto | Modelli supportati | Cosa mostra |
|----------|------------------|---------------|
| Importanza delle feature (v0.3.4) | RandomForest | Importanza di Gini (basata su alberi) |
| Coefficienti lineari (v0.3.5) | LogisticRegression, LinearSVC | Coefficienti del modello |

Questi elementi sono complementari:
- Utilizzare l'importanza delle feature per i modelli ensemble
- Utilizzare i coefficienti lineari per i modelli lineari interpretabili

### Guida all'interpretazione

Per LogisticRegression (binaria):
- Coefficiente positivo: Aumento della feature → Maggiore probabilità della classe positiva
- Coefficiente negativo: Aumento della feature → Minore probabilità della classe positiva
- Magnitudine: Valore assoluto maggiore = Influenza più forte

Esempio: `coefficiente = 2.0` significa +1 deviazione standard in questa feature → +2.0 per i log-odds

---

## Indice di interpretabilità (v0.3.6+)

La versione 3.6 aggiunge un artefatto di indice unificato che collega tutti gli output di interpretabilità per un'esecuzione.

### Scopo

L'indice di interpretabilità risponde alla domanda: "Quali output di interpretabilità sono disponibili per questa esecuzione, quali sono le versioni e dove si trovano?".

Non vengono eseguite nuove elaborazioni, ma solo collegamenti e riepiloghi degli artefatti esistenti.

### Artefatto dell'indice

Ogni esecuzione genera il file `artifacts/interpretability.index.v1.json`:

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

### Regole di disponibilità

- Gli artefatti assenti vengono **omessi** da `available_artifacts` (non impostati a null o false)
- L'indice dichiara la disponibilità solo se il file esiste effettivamente
- Un'esecuzione minima (LogisticRegression) avrà `metrics_v1` e `linear_coefficients_v1`
- Un'esecuzione di RandomForest avrà `metrics_v1` e `feature_importance_v1`

### Contenuto riassuntivo

I riepiloghi includono solo dati di riferimento (nessun valore numerico duplicato):

| Artefatto | Riepilogo che contiene: |
|----------|------------------|
| metrics_v1 | `metrics_profile`, `accuracy` (dal file run.json) |
| feature_importance_v1 | `model_family`, `top_k` (solo nomi, massimo 5) |
| linear_coefficients_v1 | `model_family`, `num_classes`, `top_k_by_class` (solo nomi) |

### Comando per VS Code

Utilizzare `RunForge: Visualizza l'indice di interpretabilità più recente` per visualizzare un riepilogo formattato con collegamenti diretti per aprire i singoli elementi.

---

## Come iniziare

Per una guida dettagliata, consultare [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

---

## Contratto e documentazione

### Documenti principali

| Documento | Scopo |
|----------|---------|
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | Come RunForge stabilisce la fiducia |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | Tour guidato di 2-3 minuti |
| [CONTRACT.md](CONTRACT.md) | Contratto comportamentale completo |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | Regole di espansione della fase 3 |

### Fase 2 (congelata)

| Documento | Ambito |
|----------|-------|
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | Osservabilità |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | Introspezione |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | Miglioramenti dell'esperienza utente |

### Fase 3 (congelata a partire dalla versione v0.3.6.0)

| Documento | Ambito |
|----------|-------|
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | Selezione del modello |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | Iperparametri e profili |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | Metriche specifiche per il modello |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | Importanza delle caratteristiche |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | Coefficienti lineari |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | Indice di interpretabilità |

### Prossimi passi

Consultare [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) per i miglioramenti previsti.

---

## Stato della fase

| Fase | Focus | Stato |
|-------|-------|--------|
| **Phase 2** | Addestramento principale, osservabilità | Congelata |
| **Phase 3** | Selezione del modello, interpretabilità | **Frozen (v0.3.6.0)** |
| **Phase 4** | Ciclo di vita, ripristino, principi | **Rilasciata (v1.1.0)** — vedere [`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) |

**Tutte le interfacce del contratto delle fasi 2, 3 e 4 sono bloccate. I lavori futuri richiedono un contratto della fase 5.**

---

## Licenza

MIT

---

Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
