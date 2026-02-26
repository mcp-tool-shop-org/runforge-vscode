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

Formazione di modelli di machine learning tramite interfaccia a pulsante, con un comportamento deterministico e basato su specifiche contrattuali.

> **La fase 3 (funzionalità e interpretabilità) è stata completata con la versione 0.3.6.0.**
> I lavori futuri proseguono nell'ambito dei contratti della fase 4.

---

## 🛡️ La garanzia RunForge

RunForge è un software progettato per eliminare la frase "funziona sulla mia macchina" e sostituirla con una certezza basata su dati forensi.

### Ciò che garantiamo
1.  **Determinismo:** Ogni esecuzione parte da un seme predefinito. Eseguire nuovamente la stessa configurazione con lo stesso seme e sugli stessi dati produce esattamente lo stesso modello.
2.  **Tracciabilità:** Ogni record in `run.json` include l'hash del commit Git, il percorso dell'interprete Python e la versione dell'estensione utilizzata. È possibile risalire a qualsiasi modello al codice che lo ha generato.
3.  **Verificabilità:** Gli artefatti (modelli, metriche, log) vengono salvati su disco in formati standard (JSON, joblib). Non ci sono database nascosti, né dipendenze dal cloud.

### Cosa questo non è
-   **Non è uno strumento AutoML "magico"**: Non cerchiamo di indovinare cosa desiderate. Utilizziamo impostazioni predefinite specifiche e personalizzabili.
-   **Non è una piattaforma cloud**: Non inviamo i vostri dati da nessuna parte. Tutto avviene localmente, all'interno del vostro ambiente di lavoro VS Code.

Per maggiori informazioni sul modello di fiducia completo, consultare il documento [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md).

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

## Installazione

```bash
npm install
npm run compile
```

## Comandi

| Comando. | Descrizione. |
| Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| `RunForge: Train (Standard)` | Eseguire l'addestramento utilizzando le impostazioni predefinite di "std-train". |
| `RunForge: Train (High Quality)` | Eseguire l'addestramento utilizzando le impostazioni predefinite di "hq-train". |
| `RunForge: Open Runs` | Visualizza le sessioni di allenamento completate. |
| `RunForge: Inspect Dataset` | Validare il set di dati prima dell'addestramento (versione 0.2.2.1 e successive). |
| `RunForge: Open Latest Run Metadata` | Visualizzare i metadati dell'ultima esecuzione (versione 0.2.2.1 o successiva). |
| `RunForge: Inspect Model Artifact` | Visualizzare la struttura della pipeline contenuta nel file model.pkl (versione 0.2.2.2 e successive). |
| `RunForge: Browse Runs` | Esplora tutte le esecuzioni con le relative informazioni (riepilogo, diagnostica, artefatti) (versione 0.2.3 e successive). |
| `RunForge: View Latest Metrics` | Visualizzare i dettagli delle metriche a partire dal file metrics.v1.json (versione 0.3.3 e successive). |
| `RunForge: View Latest Feature Importance` | Visualizzare l'importanza delle caratteristiche per i modelli RandomForest (versione 0.3.4 e successive). |
| `RunForge: View Latest Linear Coefficients` | Visualizzare i coefficienti dei modelli lineari (versione 0.3.5 e successive). |
| `RunForge: View Latest Interpretability Index` | Visualizzare l'indice unificato di tutti gli elementi relativi all'interpretabilità (versione 0.3.6 e successive). |
| `RunForge: Export Latest Run as Markdown` | Salva un riepilogo formattato in Markdown dell'ultima esecuzione (versione 0.4.3 o successiva). |

## Utilizzo

1. Impostare la variabile d'ambiente `RUNFORGE_DATASET` sul percorso del file CSV.
2. Il file CSV deve contenere una colonna denominata `label`.
3. Avviare l'addestramento tramite la Palette dei comandi.

---

## Garanzie (versione 0.2.1 e successive)

RunForge VS Code offre un addestramento di modelli di machine learning deterministico e basato su contratti. Le garanzie riportate di seguito sono intenzionali e vengono verificate tramite test.

### Determinismo

Considerando lo stesso set di dati, la stessa configurazione e la stessa versione di RunForge:

- Le divisioni tra dati di addestramento e validazione sono identiche in tutte le esecuzioni.
- Gli artefatti generati sono riproducibili.
- I risultati delle metriche sono stabili.

Non esiste casualità al di fuori di comportamenti esplicitamente programmati.

### Gestione delle etichette

- La colonna che contiene le etichette è specificata in modo esplicito.
- L'etichetta non viene mai dedotta dalla posizione della colonna.
- Le etichette configurate in modo errato o mancanti vengono rilevate in una fase iniziale.

### Contratto relativo alle metriche

La formazione produce esattamente tre indicatori di performance:

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

Nessun campo aggiuntivo viene aggiunto implicitamente.
L'estensione dello schema richiede una modifica contrattuale con gestione delle versioni.

### Artefatti del modello

- `model.pkl` è sempre un oggetto serializzato di tipo `sklearn.Pipeline`.
- Tutte le fasi di pre-elaborazione (ad esempio, la normalizzazione) sono incluse.
- L'elemento prodotto è autonomo e pronto per essere utilizzato per le inferenze.

Non sono necessari passaggi di pre-elaborazione esterni.

### Dati mancanti

- Le righe contenenti valori mancanti vengono eliminate in modo deterministico.
- Il numero di righe eliminate viene registrato.
- Non vengono eseguite operazioni di imputazione implicita.

### Fonte di verità

- Tutta la logica di esecuzione di Python è contenuta nella directory `python/ml_runner/`.
- Non ci sono implementazioni duplicate o alternative.
- I test garantiscono la coerenza tra il comportamento di TypeScript e quello di Python.

### Politica di stabilità

- Il comportamento nella versione 0.2.1 è stato stabilizzato.
- Le modifiche che introducono incompatibilità richiedono un aggiornamento esplicito alla versione principale.
- Le modifiche nel comportamento che non vengono comunicate esplicitamente sono considerate errori.

---

## Gol evitati (volontariamente)

Attualmente, RunForge non si propone di:

- Selezione automatica dei modelli (l'utente deve scegliere esplicitamente).
- Ottimizzazione degli iperparametri (i valori predefiniti sono fissi per ogni configurazione).
- Esecuzione di addestramento online o incrementale.
- Nascondere il comportamento dell'addestramento tramite regole predefinite.

L'accuratezza e la trasparenza sono prioritarie rispetto all'automazione.

---

---

## Osservabilità (versione 0.2.2.1 e successive)

La fase 2.2.1 aggiunge funzionalità di monitoraggio per le esecuzioni di training, senza modificare il comportamento del processo di training.

### Esecuzione dei metadati

Ogni sessione di allenamento genera un file `run.json` che contiene:

- Identificativo dell'esecuzione e timestamp.
- Impronta digitale del dataset (SHA-256).
- Colonna delle etichette e numero di caratteristiche.
- Numero di righe eliminate.
- Snapshot delle metriche.
- Percorsi dei file generati.

### Ispezione del dataset

Esaminare i set di dati prima dell'addestramento:

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Restituisce i nomi delle colonne, il numero di righe, il numero di caratteristiche e verifica la validità delle etichette.

### Tracciabilità dell'origine

Tutte le esecuzioni sono indicizzate nel file `.runforge/index.json` per garantire la tracciabilità.

- Partendo da un file `model.pkl`, è possibile risalire ai metadati dell'esecuzione.
- È possibile trovare tutte le esecuzioni associate a una specifica "impronta digitale" del dataset.
- L'indice è di sola scrittura (non consente riordinamenti o eliminazioni).

---

## Introspezione degli artefatti (versione 0.2.2.2 e successive)

La fase 2.2.2 introduce la possibilità di visualizzare, in sola lettura, i risultati ottenuti durante l'addestramento.

L'ispezione è una modalità di sola lettura e non prevede né il riaddestramento, né la modifica degli elementi analizzati.

### Ispezione di condotte

Esaminare il contenuto di un file `model.pkl` senza doverlo riaddestrare.

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Restituisce un JSON strutturato contenente:

- Fasi del processo (in ordine).
- Tipi di fase e moduli.
- Rilevamento preliminare.

Ecco un esempio di output:

[Italian translation of the English text]

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

Le diagnosi strutturate spiegano perché un'esecuzione si è comportata in un determinato modo:

| Code | Descrizione. |
| Certainly. Please provide the English text you would like me to translate. | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| `MISSING_VALUES_DROPPED` | Righe eliminate a causa di valori mancanti. |
| `LABEL_NOT_FOUND` | La colonna "etichetta" non è presente nel set di dati. |
| `LABEL_TYPE_INVALID` | La colonna "Etichetta" ha un tipo di dato non valido. |
| `ZERO_ROWS` | Il set di dati risulta vuoto dopo l'elaborazione. |
| `ZERO_FEATURES` | Il dataset non contiene colonne con attributi. |
| `LABEL_ONLY_DATASET` | Il dataset contiene solo la colonna delle etichette. |

Tutte le informazioni diagnostiche sono in formato JSON, un formato leggibile dalle macchine (non è necessario alcun processo di analisi dei log).

---

## Esplora le corse (versione 0.2.3 e successive)

La fase 2.3 introduce un browser di esecuzioni unificato con funzionalità rapide.

### Utilizzo delle esecuzioni di navigazione

1. Aprire la palette dei comandi (`Ctrl+Shift+P`).
2. Eseguire il comando `RunForge: Esplora le esecuzioni`.
3. Selezionare un'esecuzione dall'elenco (ordinato per data, dalla più recente alla più vecchia).
4. Scegliere un'azione:
- **Apri il riepilogo dell'esecuzione** — Visualizzare i metadati dell'esecuzione in formato Markdown leggibile.
- **Visualizza le informazioni diagnostiche** — Vedere cosa è successo durante l'esecuzione.
- **Esamina l'artefatto del modello** — Visualizzare la struttura della pipeline.
- **Copia l'impronta digitale del dataset** — Copiare l'hash SHA-256 negli appunti.

### Diagnostica integrata

Le informazioni diagnostiche sono ricavate dai campi del file "run.json":

| Condizione. | Diagnostico. |
| Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

Sono previste, nelle fasi future, analisi diagnostiche complete e strutturate delle emissioni.

---

## Selezione del modello (versione 0.3.1 e successive)

La fase 3.1 introduce una selezione esplicita del modello, mantenendo al contempo tutte le garanzie offerte dalla fase 2.

### Modelli supportati

| Model | Valore CLI. | Descrizione. |
| Certainly. Please provide the English text you would like me to translate. | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| Regressione logistica. | `logistic_regression` | Predefinito, veloce, interpretabile. |
| Foresta casuale. | `random_forest` | Ensemble, per la gestione di modelli non lineari. |
| Support Vector Machine lineare. | `linear_svc` | Classificatore a vettori di supporto, basato sul margine. |

### Configurazione

Impostare la famiglia di modelli nelle impostazioni di VS Code:

```json
{
  "runforge.modelFamily": "random_forest"
}
```

Oppure, utilizzare l'interfaccia delle impostazioni: cercare "Famiglia di modelli RunForge" e selezionare l'opzione desiderata dal menu a tendina.

### Utilizzo della riga di comando

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

L'argomento `--model` è facoltativo. Valore predefinito: `logistic_regression`.

### Provenienza

La famiglia di modelli selezionata è registrata nel file `run.json`:

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Compatibilità con le versioni precedenti

- Tutte le esecuzioni della Fase 2 rimangono leggibili.
- Il comportamento predefinito rimane invariato (regressione logistica).
- Non è necessaria alcuna migrazione.
- La fase di pre-elaborazione rimane invariata (StandardScaler per tutti i modelli).

---

## Iperparametri e profili di addestramento (versione 0.3.2 e successive)

La versione 3.2 introduce un controllo esplicito degli iperparametri e dei profili di addestramento.

### Profili di formazione

I profili predefiniti offrono parametri di configurazione preimpostati:

| Profilo. | Descrizione. | Modello di famiglia. |
| Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| `default` | Nessuna sovrascrittura dei parametri di configurazione. | (utilizza l'impostazione) |
| `fast` | Meno iterazioni per esecuzioni rapide. | regressione_logistica |
| `thorough` | Più alberi/iterazioni per una migliore qualità. | foresta casuale |

Configurare nelle impostazioni di VS Code:
```json
{
  "runforge.profile": "fast"
}
```

### Iperparametri dell'interfaccia a riga di comando

È possibile sovrascrivere i singoli iperparametri tramite l'interfaccia a riga di comando.

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Regole di precedenza

Quando sia i parametri del profilo che quelli della riga di comando sono impostati:

1. **Parametri specificati tramite la riga di comando (`--param`)** (priorità massima)
2. **Parametri estesi tramite il profilo**
3. **Impostazioni predefinite del modello** (priorità minima)

### Provenienza

Gli iperparametri e i profili vengono registrati nel file `run.json`:

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

Quando non viene utilizzato alcun profilo, i campi del profilo vengono completamente omessi (non vengono impostati a "null").

---

## Metriche specifiche per i modelli (versione 0.3.3 e successive)

La fase 3.3 introduce metriche dettagliate e specifiche per ogni modello, con la possibilità di selezionare il profilo in base alle funzionalità.

### Profili delle metriche

I profili di metriche vengono selezionati automaticamente in base alle capacità del modello.

| Profilo. | Descrizione. | Metriche. |
| Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| `classification.base.v1` | Tutti i classificatori. | accuratezza, precisione, richiamo, F1, matrice di confusione. |
| `classification.proba.v1` | Binario + probabilità previste. | base + ROC-AUC, perdita logaritmica. |
| `classification.multiclass.v1` | 3 o più lezioni. | base + precisione/richiamo/f1 per classe. |

### Logica di selezione del profilo

- Classificazione binaria + `predict_proba` → `classification.proba.v1`
- Classificazione multiclasse (3 o più classi) → `classification.multiclass.v1`
- In tutti gli altri casi → `classification.base.v1`

### Capacità del modello

| Model | predict_proba | funzione_decisione |
| Certainly. Please provide the English text you would like me to translate. | Certo, ecco la traduzione:

"---------------" | Assicuratevi di aver compreso le istruzioni prima di iniziare.
-------------------
Assicuratevi di aver compreso le istruzioni prima di iniziare. |
| RegressioneLogistica | ✅ | ✅ |
| RandomForest | ✅ | ❌ |
| LinearSVC | ❌ | ✅ (Solo per la curva ROC-AUC) |

### Artefatto delle metriche

Attualmente, il processo di training genera sia il file `metrics.v1.json` che il file `metrics.json`.

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

### Esecuzione dei metadati

Il file `run.json` ora include un riferimento a `metrics_v1`:

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

### Compatibilità con le versioni precedenti

- Il file `metrics.json` (fase 2) rimane invariato.
- Tutti gli strumenti esistenti continuano a funzionare.
- I campi del profilo in `run.json` vengono visualizzati tutti insieme o nessuno.

---

## Importanza delle caratteristiche (versione 0.3.4 e successive)

La versione 3.4 introduce una funzionalità di estrazione dell'importanza delle caratteristiche in sola lettura, supportata per determinati modelli.

### Modelli supportati

L'importanza delle caratteristiche è disponibile solo per i modelli che supportano nativamente questa funzionalità.

| Model | Supportato. | Tipo di importanza. |
| Certainly. Please provide the English text you would like me to translate. | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Ecco il testo da tradurre:

"The company is committed to providing high-quality products and services. We strive to meet the needs of our customers and to exceed their expectations. We are constantly innovating and improving our processes to offer the best possible solutions. We value our employees and are committed to creating a positive and supportive work environment. We are also committed to environmental sustainability and social responsibility."
-----------------

La società si impegna a fornire prodotti e servizi di alta qualità. Ci sforziamo di soddisfare le esigenze dei nostri clienti e di superare le loro aspettative. Innoviamo e miglioriamo costantemente i nostri processi per offrire le soluzioni migliori possibili. Valorizziamo i nostri dipendenti e ci impegniamo a creare un ambiente di lavoro positivo e stimolante. Siamo inoltre impegnati nella sostenibilità ambientale e nella responsabilità sociale. |
| RandomForest | ✅ | Importanza di Gini. |
| RegressioneLogistica | ❌ | Non disponibile nella versione 1. |
| LinearSVC | ❌ | Non disponibile nella versione 1. |

**Nessuna approssimazione**: Se il modello non supporta la funzionalità nativa di rilevamento dell'importanza, non viene generato alcun artefatto.

### Importanza delle caratteristiche, artefatto

Le esecuzioni di RandomForest generano il file `artifacts/feature_importance.v1.json`:

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

### Esecuzione dei metadati

Il file `run.json` include, quando disponibile, un riferimento all'importanza delle diverse caratteristiche.

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

Quando l'importanza delle caratteristiche non è disponibile, questi campi vengono completamente omessi (non vengono inseriti valori nulli).

### Diagnostica

I modelli non supportati emettono informazioni diagnostiche strutturate:

| Code | Descrizione. |
| Certainly. Please provide the English text you would like me to translate. | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | Il modello non supporta la funzionalità nativa di valutazione dell'importanza delle caratteristiche. |
| `FEATURE_NAMES_UNAVAILABLE` | I nomi delle funzionalità non sono stati riconosciuti. |

### Non supportato nella versione 1

I seguenti elementi sono esplicitamente esclusi dall'ambito della versione 1:

- Importanza basata sui coefficienti per modelli lineari.
- Spiegazioni tramite SHAP/LIME.
- Importanza tramite permutazione.
- Grafici di dipendenza parziale.

### Iperparametri supportati

**Regressione Logistica:**
- `C` (float, > 0): Intensità della regolarizzazione.
- `max_iter` (int, > 0): Numero massimo di iterazioni.
- `solver` (str): Algoritmo di ottimizzazione.
- `warm_start` (bool): Utilizzare la soluzione precedente.

**Random Forest:**
- `n_estimators` (intero, > 0): Numero di alberi
- `max_depth` (intero o None): Profondità massima degli alberi
- `min_samples_split` (intero, >= 2): Numero minimo di campioni per la divisione
- `min_samples_leaf` (intero, > 0): Numero minimo di campioni per ogni nodo foglia.

**Support Vector Machine lineare (Linear SVC):**
- `C` (float, > 0): Intensità della regolarizzazione.
- `max_iter` (int, > 0): Numero massimo di iterazioni.

---

## Coefficienti lineari (versione 0.3.5 e successive)

La fase 3.5 introduce la possibilità di estrarre i coefficienti in modalità sola lettura per i classificatori lineari.

### Modelli supportati

I coefficienti lineari sono disponibili per i modelli che possiedono l'attributo nativo `coef_`:

| Model | Supportato. | Tipo di coefficiente. |
| Certainly. Please provide the English text you would like me to translate. | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | ------------------
Ecco il testo da tradurre:

"The company is committed to providing high-quality products and services. We strive to meet the needs of our customers and to exceed their expectations. We are constantly innovating and improving our processes to offer the best possible solutions. We value our employees and are committed to creating a positive and supportive work environment. We are also committed to environmental sustainability and social responsibility."
------------------

La società si impegna a fornire prodotti e servizi di alta qualità. Ci sforziamo di soddisfare le esigenze dei nostri clienti e di superare le loro aspettative. Innoviamo e miglioriamo costantemente i nostri processi per offrire le soluzioni migliori possibili. Valorizziamo i nostri dipendenti e ci impegniamo a creare un ambiente di lavoro positivo e stimolante. Siamo inoltre impegnati nella sostenibilità ambientale e nella responsabilità sociale. |
| RegressioneLogistica | ✅ | Coefficienti log-odds. |
| LinearSVC | ✅ | Coefficienti SVM. |
| RandomForest | ❌ | Utilizzate invece l'importanza delle caratteristiche. |

**Nessuna approssimazione**: se il modello non supporta i coefficienti nativi, non viene generato alcun artefatto.

### Spazio dei coefficienti (IMPORTANTE)

Tutti i coefficienti sono espressi in uno spazio di caratteristiche normalizzato.

Questo significa:
- I coefficienti corrispondono alle caratteristiche DOPO l'applicazione dello StandardScaler.
- I valori rappresentano l'influenza per ogni aumento di una deviazione standard.
- Non si tenta di "invertire" la scala per tornare alle unità originali delle caratteristiche.
- Il confronto dei coefficienti tra le diverse caratteristiche è significativo (stessa scala).
- Il confronto dei coefficienti con i valori originali delle caratteristiche NON è significativo.

### Artefatto dovuto ai coefficienti lineari

Le esecuzioni del modello lineare generano il file `artifacts/linear_coefficients.v1.json`:

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

### Supporto per classificazioni multiple

Per la classificazione multiclasse (con 3 o più classi), i coefficienti sono raggruppati per classe:

- Ogni classe ha il proprio insieme di coefficienti.
- Le etichette delle classi sono ordinate in modo deterministico.
- Nella versione 1, non è prevista alcuna aggregazione tra le classi.

### Esecuzione dei metadati

Il file `run.json` include i coefficienti lineari di riferimento, quando disponibili.

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

Quando i coefficienti non sono disponibili, questi campi vengono omessi completamente (non vengono inseriti valori nulli).

### Diagnostica

I modelli non supportati emettono informazioni diagnostiche strutturate:

| Code | Descrizione. |
| Certainly. Please provide the English text you would like me to translate. | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | Il modello non supporta l'estrazione dei coefficienti. |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | Il classificatore non dispone dell'attributo "coef". |
| `FEATURE_NAMES_UNAVAILABLE` | I nomi delle funzionalità non sono stati risolti. |

### Importanza delle caratteristiche rispetto ai coefficienti lineari

| Manufatto. | Modelli supportati. | Cosa mostra. |
| Certainly. Please provide the English text you would like me to translate. I will do my best to provide an accurate and natural-sounding Italian translation. | ------------------
Ecco il testo da tradurre:

"The company is committed to providing high-quality products and services. We strive to meet the needs of our customers and to exceed their expectations. We are constantly innovating and improving our processes to offer the best possible solutions. We value our employees and are committed to creating a positive and supportive work environment. We are also committed to sustainability and to protecting the environment."
------------------

La società si impegna a fornire prodotti e servizi di alta qualità. Ci sforziamo di soddisfare le esigenze dei nostri clienti e di superare le loro aspettative. Innoviamo e miglioriamo costantemente i nostri processi per offrire le soluzioni migliori possibili. Valorizziamo i nostri dipendenti e ci impegniamo a creare un ambiente di lavoro positivo e stimolante. Siamo inoltre impegnati nella sostenibilità e nella protezione dell'ambiente. | "Please provide the text you would like me to translate." |
| Importanza delle caratteristiche (versione 0.3.4). | RandomForest | Importanza di Gini (basata su alberi decisionali). |
| Coefficienti lineari (versione 0.3.5) | LogisticRegression, LinearSVC. | Coefficienti del modello. |

Questi elementi sono complementari:
- Utilizzare l'importanza delle caratteristiche per i modelli di ensemble.
- Utilizzare i coefficienti lineari per i modelli lineari interpretabili.

### Guida all'interpretazione

Per la regressione logistica (binaria):
- Coefficiente positivo: Aumento della caratteristica → Probabilità più alta della classe positiva.
- Coefficiente negativo: Aumento della caratteristica → Probabilità più bassa della classe positiva.
- Entità: Valore assoluto maggiore = Influenza più forte.

Esempio: `coefficiente = 2.0` significa +1 deviazione standard in questa caratteristica → +2.0 nella scala dei log-odds.

---

## Indice di interpretabilità (versione 0.3.6 e successive)

La versione 3.6 introduce un indice unificato che collega tutti i risultati relativi all'interpretabilità per una determinata esecuzione.

### Scopo

L'indice di interpretabilità risponde alle seguenti domande: "Quali output di interpretabilità sono disponibili per questa esecuzione, a quali versioni appartengono e dove si trovano?".

Nessun calcolo nuovo: si tratta semplicemente di collegare e riassumere informazioni già esistenti.

### Indice degli elementi

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

- Gli artefatti mancanti vengono **esclusi** da `available_artifacts` (non vengono impostati a null o a false).
- L'indice indica la disponibilità solo se il file esiste effettivamente.
- Un'esecuzione minima (LogisticRegression) avrà `metrics_v1` e `linear_coefficients_v1`.
- Un'esecuzione di RandomForest avrà `metrics_v1` e `feature_importance_v1`.

### Contenuto riassuntivo

I riassunti includono solo dati di riferimento (senza valori numerici duplicati).

| Manufatto. | Riassunto. Contiene. |
| Please provide the English text you would like me to translate. I am ready to translate it into Italian. | ------------------
Ecco il testo da tradurre:

"The company is committed to providing high-quality products and services. We strive to meet the needs of our customers and to exceed their expectations. We are constantly innovating and improving our processes to offer the best possible solutions. We value our employees and their contributions to our success. We are committed to environmental sustainability and social responsibility."
------------------

La società si impegna a fornire prodotti e servizi di alta qualità. Ci sforziamo di soddisfare le esigenze dei nostri clienti e di superare le loro aspettative. Innoviamo e miglioriamo costantemente i nostri processi per offrire le soluzioni migliori possibili. Valorizziamo i nostri dipendenti e il loro contributo al nostro successo. Siamo impegnati nella sostenibilità ambientale e nella responsabilità sociale. |
| metriche_v1 | `metrics_profile`, `accuratezza` (dati estratti dal file run.json) |
| importanza_delle_caratteristiche_v1 | `model_family`, `top_k` (solo i nomi, massimo 5). |
| coefficienti_lineari_v1 | `model_family`, `num_classes`, `top_k_by_class` (solo i nomi) |

### Comando di VS Code

Utilizzare la funzione "RunForge: Visualizza l'indice di interpretabilità più recente" per visualizzare un riepilogo formattato con collegamenti diretti per aprire i singoli elementi.

---

## Come iniziare

Per una guida dettagliata, consultare il file [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

---

## Contratti e documentazione

### Documenti fondamentali

| Documento. | Scopo. |
| Certainly. Please provide the English text you would like me to translate. I will do my best to provide an accurate and natural-sounding Italian translation. | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | Come RunForge crea un rapporto di fiducia. |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | Visita guidata della durata di 2-3 minuti. |
| [CONTRACT.md](CONTRACT.md) | Contratto comportamentale completo. |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | Regole per l'espansione nella fase 3. |

### Fase 2 (Congelamento)

| Documento. | Scope |
| Please provide the English text you would like me to translate. I am ready to translate it into Italian. | Certainly. Please provide the English text you would like me to translate. |
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | Osservabilità. |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | Introspezione. |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | Rifinitura dell'esperienza utente. |

### Fase 3 (congelata alla versione 0.3.6.0)

| Documento. | Scope |
| Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." | Certainly. Please provide the English text you would like me to translate. |
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | Selezione del modello. |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | Iperparametri e profili. |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | Metriche specifiche per il modello. |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | Importanza delle caratteristiche. |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | Coefficienti lineari. |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | Indice di interpretabilità. |

### Futuro

Consultare il documento [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) per i miglioramenti previsti.

---

## Stato della fase

| Phase | Focus | Stato. |
| Certainly. Please provide the English text you would like me to translate. | Certainly. Please provide the English text you would like me to translate. | Certo, ecco la traduzione:

"Please provide the English text you would like me to translate into Italian." |
| **Phase 2** | Formazione di base, monitoraggio e controllo. | Congelato. |
| **Phase 3** | Selezione del modello, interpretabilità. | **Frozen (v0.3.6.0)** |
| **Phase 4** | TBD | Richiede un nuovo contratto. |

Tutte le garanzie relative alle fasi 2 e 3 sono state definite. Per i lavori futuri, sono necessari contratti relativi alla fase 4.

---

## Licenza

MIT.
