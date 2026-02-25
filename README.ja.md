<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="RunForge Logo" width="400" />
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/runforge-vscode/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/runforge-vscode/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.runforge"><img src="https://img.shields.io/visual-studio-marketplace/v/mcp-tool-shop.runforge.svg" alt="Marketplace"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://mcp-tool-shop-org.github.io/runforge-vscode/"><img src="https://img.shields.io/badge/Landing_Page-live-blue" alt="Landing Page"></a>
</p>

ボタン一つで利用できる機械学習トレーニング機能。動作は決定論的であり、契約に基づいて制御されます。

**第3段階（機能と解釈可能性）は、バージョン0.3.6.0で完了しました。**
今後の開発は、第4段階の契約に基づいて進められます。

---

## 🛡️ RunForge の保証規定

RunForgeは、特定の考え方に基づいて設計されたソフトウェアであり、その目的は「私の環境では動く」という曖昧な状況を、法医学的な確実性に基づいて解決することです。

### 私たちが保証するもの
1. **決定性:** すべての実行はシード値によって制御されます。同じデータに対して、同じ設定とシード値で再度実行すると、常に同じモデルが生成されます。
2. **トレーサビリティ:** 各 `run.json` レコードには、GitのコミットID、Pythonインタプリタのパス、および使用された拡張機能のバージョンが記録されています。これにより、どのモデルも、それを生成したコードまで遡ることができます。
3. **監査可能性:** 生成された成果物（モデル、メトリクス、ログ）は、標準的な形式（JSON、joblib）でディスクに保存されます。隠されたデータベースやクラウドへの依存はありません。

### これは何ではないか
- **魔法のような自動機械学習ツールではありません**: ユーザーの意図を推測することはありません。特定の、調整可能な設定に基づいて動作します。
- **クラウドプラットフォームではありません**: ユーザーのデータはどこにも送信されません。すべての処理は、VS Codeのワークスペース内でローカルに実行されます。

完全な信頼モデルについては、[docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) を参照してください。

### ジョブのライフサイクル

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

## インストール

```bash
npm install
npm run compile
```

## コマンド

| コマンド | 説明 |
| 以下に翻訳します。
---------
Please provide the English text you would like me to translate. | 以下に翻訳します。
------------- |
| `RunForge: Train (Standard)` | 標準のトレーニング設定（std-train）を使用してトレーニングを実行します。 |
| `RunForge: Train (High Quality)` | 「hq-train」プリセットを使用してトレーニングを実行します。 |
| `RunForge: Open Runs` | 完了したトレーニング記録を表示します。 |
| `RunForge: Inspect Dataset` | トレーニングを開始する前に、データセットを検証してください (v0.2.2.1 以降)。 |
| `RunForge: Open Latest Run Metadata` | 最新の実行結果に関するメタデータを表示します (バージョン 0.2.2.1 以降)。 |
| `RunForge: Inspect Model Artifact` | モデルの "model.pkl" (バージョン 0.2.2.2 以降) のパイプライン構造を表示します。 |
| `RunForge: Browse Runs` | アクションを含むすべての実行履歴を表示 (概要、診断情報、成果物) (v0.2.3 以降) |
| `RunForge: View Latest Metrics` | 詳細な指標は、metrics.v1.json ファイル（バージョン 0.3.3 以降）から確認できます。 |
| `RunForge: View Latest Feature Importance` | ランダムフォレストモデルにおける特徴量の重要度を確認できます (バージョン 0.3.4 以降)。 |
| `RunForge: View Latest Linear Coefficients` | 線形モデルの係数を表示します (バージョン 0.3.5 以降)。 |
| `RunForge: View Latest Interpretability Index` | すべての解釈可能性に関する情報をまとめたインデックスを表示します (バージョン 0.3.6 以降)。 |
| `RunForge: Export Latest Run as Markdown` | 最新の実行結果（バージョン0.4.3以降）を、整形されたMarkdown形式のサマリーとして保存します。 |

## 使用方法

1. `RUNFORGE_DATASET` 環境変数を、CSVファイルへのパスに設定してください。
2. CSVファイルには、`label`という名前の列が必ず含まれている必要があります。
3. コマンドパレットからトレーニングを開始してください。

---

## 保証 (v0.2.1 以降)

RunForge VS Codeは、決定論的で、契約に基づいて動作する機械学習のトレーニング機能を提供します。以下に示す保証内容は意図的に設けられており、テストによってその有効性が確認されています。

### 決定論

同じデータセット、設定、およびRunForgeのバージョンを使用した場合：

- 学習データと検証データの分割は、すべての実行において同一です。
- 生成されるデータは、再現可能です。
- 評価指標の結果は、安定しています。

明示的に設定された動作以外の部分は、ランダム性を含みません。

### ラベルの取り扱いについて

- ラベルの列が明示的に指定されます。
- ラベルは、列の位置によって推測されることはありません。
- 設定ミスやラベルの欠落がある場合、早期にエラーが発生します。

### メトリクス契約

トレーニングによって、以下の3つの指標が算出されます。

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

追加のフィールドは、暗黙的に追加されることはありません。
スキーマの拡張には、バージョン管理された契約変更が必要です。

### モデルの成果物

- `model.pkl` は常にシリアライズされた `sklearn.Pipeline` オブジェクトです。
- すべての前処理（例えば、スケーリング）が内部に組み込まれています。
- このファイルは独立しており、すぐに推論に使用できます。

外部での前処理は一切必要ありません。

### 欠損データ

- 欠損値を含む行は、常に同じルールに基づいて削除されます。
- 削除された行の数は記録されます。
- データ補完は行われません。

### 真実の源泉

- すべてのPython実行ロジックは、`python/ml_runner/` ディレクトリに格納されています。
- 重複した実装や代替実装はありません。
- テストは、TypeScriptとPythonの動作が一致していることを保証します。

### 安定政策

- v0.2.1 における動作は固定されています。
- 互換性を損なう変更は、必ずメジャーバージョン番号の更新が必要です。
- 動作に関する変更で、ユーザーに影響を与えないものは、バグとして扱われます。

---

## 意図的な目標外の行為

RunForgeは、現時点では以下の機能を提供していません。

- モデルの自動選択（ユーザーは明示的に選択する必要があります）
- ハイパーパラメータの調整（デフォルト値は、各プリセットごとに固定されています）
- オンライン学習または増分学習の実行
- 学習プロセスをヒューリスティックによって隠蔽する

正確性と透明性が、自動化よりも優先されます。

---

---

## 可観測性 (バージョン 0.2.2.1 以降)

バージョン2.2.1では、トレーニングの実行状況を可視化する機能が追加されました。この機能によって、トレーニングの動作自体は変更されません。

### 実行中のメタデータ

各回のトレーニング実行ごとに、`run.json`というファイルが生成されます。このファイルには、以下の情報が含まれています。

- 実行IDとタイムスタンプ
- データセットのフィンガープリント（SHA-256）
- ラベル列と特徴量の数
- 削除された行の数
- メトリクスのスナップショット
- アーティファクトのパス

### データセットの確認

トレーニングを開始する前に、データセットを必ず確認してください。

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

列名、行数、特徴量の数、およびラベルの検証結果を返します。

### 製品の追跡・管理機能

すべての実行履歴は、`.runforge/index.json` ファイルにインデックスとして記録されており、追跡が可能です。

- `model.pkl` ファイルから、実行に関するメタデータを追跡します。
- 特定のデータセットのフィンガープリントに一致するすべての実行を検索します。
- 追記専用のインデックスであり、データの並び替えや削除は行われません。

---

## アーティファクトの自己診断機能 (バージョン 0.2.2.2 以降)

バージョン2.2.2では、学習済みのデータやモデルなどを読み取り専用で確認できる機能が追加されました。

**検査機能は読み取り専用であり、学習データの再学習や、生成されたデータの修正は行いません。**

### パイプライン検査

`model.pkl`ファイルの中身を、モデルを再学習することなく確認する方法：

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

以下の構造を持つJSON形式で結果を返します。

- パイプラインのステップ（順序）
- ステップの種類とモジュール
- 事前処理における検出機能

Example output:
例：

(Please provide the English text you want me to translate.)

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

### 診断

構造化された診断機能は、プログラムの実行結果がなぜそのようになったのかを説明します。

| Code | 説明 |
| Please provide the English text you would like me to translate. I am ready to translate it into Japanese. | 以下に翻訳します。
-------------
申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 |
| `MISSING_VALUES_DROPPED` | 欠損値が含まれるため、いくつかのデータ行が削除されました。 |
| `LABEL_NOT_FOUND` | データセットにラベル列が存在しません。 |
| `LABEL_TYPE_INVALID` | ラベル列のデータ型が不正です。 |
| `ZERO_ROWS` | データセットを処理した結果、行数が0になりました。 |
| `ZERO_FEATURES` | データセットには特徴量となる列がありません。 |
| `LABEL_ONLY_DATASET` | このデータセットには、ラベル列のみが含まれています。 |

すべての診断データは、機械で読み取り可能なJSON形式で提供されます（ログの解析は不要です）。

---

## ランの閲覧 (v0.2.3 以降)

バージョン2.3では、操作が簡単なランブラウザが追加され、様々な操作を素早く実行できるようになりました。

### ブラウズ機能の使用方法

1. コマンドパレットを開きます (`Ctrl+Shift+P`)。
2. `RunForge: Browse Runs` を実行します。
3. リストから実行を選択します（最新のものが最初に表示されます）。
4. 以下のいずれかのアクションを選択します。
- **実行サマリーを開く**: 実行に関するメタデータを、読みやすいマークダウン形式で表示します。
- **診断情報を表示**: 実行中に発生した内容を確認します。
- **モデルの成果物を確認**: パイプラインの構造を表示します。
- **データセットのフィンガープリントをコピー**: SHA-256の値をクリップボードにコピーします。

### 統合診断システム

診断情報は、run.jsonファイル内の以下の項目から取得されます。

| 状態 | 診断。 |
| 申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 | 承知いたしました。翻訳を開始します。
(Please provide the English text you would like me to translate.) |
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

今後の段階では、詳細な構造診断と排出量に関する分析を計画しています。

---

## モデルの選択 (バージョン 0.3.1 以降)

フェーズ3.1では、モデルの選択を明示的に行う機能を新たに追加しつつ、フェーズ2で提供されていたすべての機能と保証を維持しています。

### 対応機種

| Model | CLIの値。 | 説明 |
| The company is committed to providing high-quality products and services.
(会社は、高品質な製品とサービスを提供することに尽力しています。)
------- | 申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 | 以下に翻訳します。
-------------
申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 |
| ロジスティック回帰法 | `logistic_regression` | デフォルト、高速、解釈しやすい。 |
| ランダムフォレスト | `random_forest` | Ensembleは、非線形パターンを処理することができます。 |
| 線形サポートベクターマシン。 | `linear_svc` | サポートベクター分類器、マージンに基づく手法。 |

### 設定

VS Codeの設定で、使用するモデルのファミリーを指定します。

```json
{
  "runforge.modelFamily": "random_forest"
}
```

または、設定画面を使用することもできます。「RunForge モデルファミリー」を検索し、ドロップダウンメニューから選択してください。

### コマンドラインインターフェースの使用方法

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

`--model` オプションは省略可能です。デフォルト値は `logistic_regression` です。

### 来歴。
または、出所

選択されたモデルファミリーは、`run.json` ファイルに記録されています。

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### 互換性（旧システムとの）

- 第2段階のすべての処理は、引き続き実行可能です。
- デフォルトの動作は変更ありません（ロジスティック回帰）。
- マイグレーションは不要です。
- 前処理は変更ありません（すべてのモデルでStandardScalerを使用）。

---

## ハイパーパラメータとトレーニング設定 (バージョン 0.3.2 以降)

バージョン3.2では、ハイパーパラメータの制御機能とトレーニングプロファイルが新たに追加されました。

### トレーニング プロファイル

名前付きプロファイルは、あらかじめ設定されたハイパーパラメータを提供します。

| プロフィール | 説明 | モデルファミリー。 |
| 以下に翻訳します。
---------
Please provide the English text you would like me to translate. | 以下に翻訳します。
-------------
申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 | 以下に翻訳します。
--------------
The company is committed to providing high-quality products and services.
(当社は、高品質な製品とサービスを提供することに尽力しています。) |
| `default` | ハイパーパラメータの上書きは行われません。 | (設定を使用します) |
| `fast` | 高速な処理のために、反復回数を削減しました。 | ロジスティック回帰法 |
| `thorough` | より多くの試行回数を増やすことで、品質を向上させることができます。 | ランダムフォレスト |

VS Codeの設定で構成を設定します。
```json
{
  "runforge.profile": "fast"
}
```

### コマンドラインインターフェースにおけるハイパーパラメータ

コマンドラインインターフェース（CLI）から、個々のハイパーパラメータを上書きすることができます。

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### 優先順位のルール

プロファイルとCLIパラメータの両方が設定されている場合：

1. **コマンドライン引数 `--param`** (最優先)
2. **設定ファイルで定義されたパラメータ**
3. **モデルのデフォルト設定** (最優先度が低い)

### 来歴。
または、出自

ハイパーパラメータと設定プロファイルは、`run.json` ファイルに記録されます。

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

プロファイルが使用されない場合、プロファイル項目は完全に省略され、null 値にはなりません。

---

## モデルに対応した評価指標 (バージョン 0.3.3 以降)

バージョン3.3では、モデルの詳細な情報に基づいた指標が追加され、機能に基づいたプロファイル選択が可能になりました。

### メトリクス プロファイル

モデルの機能に基づいて、最適な評価指標プロファイルが自動的に選択されます。

| プロフィール | 説明. | 指標 |
| Please provide the English text you would like me to translate. I am ready to translate it into Japanese. | 以下に翻訳します。
-------------
申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 | 以下の文章を日本語に翻訳してください。 |
| `classification.base.v1` | すべての分類器。 | 精度、正確性、再現率、F1スコア、混同行列。 |
| `classification.proba.v1` | 二値分類 + 予測確率算出。 | ベースライン + ROC-AUC、対数損失。 |
| `classification.multiclass.v1` | 3つ以上のクラス。 | ベースライン値と、各クラスにおける適合率、再現率、F1スコア。 |

### プロファイル選択ロジック

- 二値分類 + `predict_proba` → `classification.proba.v1`
- 多クラス分類 (3つ以上のクラス) → `classification.multiclass.v1`
- 上記以外 → `classification.base.v1`

### モデルの機能と性能

| Model | 予測確率を算出する。 | 決定関数 |
| The company is committed to providing high-quality products and services.
(会社は、高品質な製品とサービスを提供することに尽力しています。)
------- | 以下に翻訳します。
---------------
申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 | 以下に翻訳します。
-------------------
The company is committed to providing high-quality products and services.
弊社は、高品質な製品とサービスを提供することに尽力しています。
------------------- |
| ロジスティック回帰法 | ✅ | ✅ |
| ランダムフォレスト (RandomForest) | ✅ | ❌ |
| 線形サポートベクターマシン (LinearSVC) | ❌ | ✅ (ROC-AUC のみ) |

### メトリクス関連の成果物

現在のトレーニングでは、`metrics.json`に加えて、`metrics.v1.json`というファイルも生成されます。

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

### 実行中のメタデータ

`run.json`ファイルには、現在`metrics_v1`への参照情報が含まれています。

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

### 互換性（旧機種との）

- `metrics.json` (フェーズ2) は変更ありません。
- 既存のツールはすべて引き続き利用可能です。
- `run.json` 内のプロファイル項目は、まとめて表示されるか、全く表示されないかのいずれかです。

---

## 特徴量の重要度 (バージョン0.3.4以降)

バージョン3.4では、対応するモデルについて、読み取り専用で特徴量の重要度を抽出する機能が追加されました。

### 対応機種

特徴量の重要度については、ネイティブな重要度情報を持つモデルでのみ利用可能です。

| Model | サポートされています。 | 重要度タイプ |
| The company is committed to providing high-quality products and services.
(会社は、高品質な製品とサービスを提供することに尽力しています。)
------- | 申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 | 以下に翻訳します。
-----------------
The company is committed to providing high-quality products and services.
（同社は、高品質な製品とサービスを提供することに尽力しています。） |
| ランダムフォレスト | ✅ | ジニ重要度 |
| ロジスティック回帰 (ロジスティック・レグレッション) | ❌ | v1のバージョンには含まれていません。 |
| 線形サポートベクターマシン (LinearSVC) | ❌ | v1のバージョンには含まれていません。 |

**近似値は使用しません**: モデルがネイティブな重要度をサポートしていない場合、いかなる出力も生成されません。

### 特徴量の重要度を示す指標

RandomForestを実行すると、`artifacts/feature_importance.v1.json`というファイルが生成されます。

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

### 実行中のメタデータ

`run.json`ファイルには、利用可能な場合、特徴量の重要度に関する情報が含まれています。

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

特徴量の重要度情報が利用できない場合、これらの項目は完全に省略されます（null値にはなりません）。

### 診断

サポートされていないモデルからは、構造化された診断情報が出力されます。

| Code | 説明 |
| 以下に翻訳します。
```
(No text provided for translation)
``` | 以下に翻訳します。
------------- |
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | このモデルは、組み込みの重要度評価機能に対応していません。 |
| `FEATURE_NAMES_UNAVAILABLE` | 機能名が解決できませんでした。 |

### v1ではサポートされていません

以下に示す内容は、バージョン1では対応対象外となります。

- 線形モデルにおける係数に基づく重要度評価
- SHAP/LIMEによる説明
- パーミュテーション重要度
- パラメトリック依存度プロット

### サポートされているハイパーパラメータ

**ロジスティック回帰:**
- `C` (float, > 0): 正則化の強さ
- `max_iter` (int, > 0): 最大反復回数
- `solver` (str): 最適化アルゴリズム
- `warm_start` (bool): 以前の解を再利用するかどうか

**ランダムフォレスト:**
- `n_estimators`: 決定木の数 (整数、0より大きい値)
- `max_depth`: 決定木の最大深さ (整数またはNone)
- `min_samples_split`: 分割を行う際の最小サンプル数 (整数、2以上)
- `min_samples_leaf`: 各葉ノードに必要な最小サンプル数 (整数、0より大きい値)

**線形サポートベクターマシン (Linear SVC):**
- `C` (float, > 0): 正則化の強さ
- `max_iter` (int, > 0): 最大反復回数

---

## 線形係数 (バージョン 0.3.5 以降)

バージョン3.5では、線形分類器に対して、読み取り専用の係数抽出機能が追加されました。

### 対応機種

「coef_」という属性を持つモデルの場合、線形係数を取得することができます。

| Model | サポートされています。 | 係数タイプ |
| The company is committed to providing high-quality products and services.
(会社は、高品質な製品とサービスを提供することに尽力しています。) | 申し訳ありませんが、翻訳するテキストが提供されていません。テキストを入力してください。 | 以下に翻訳します。
------------------
The company is committed to providing high-quality products and services.
（同社は、高品質な製品とサービスを提供することに尽力しています。） |
| ロジスティック回帰法 | ✅ | 対数オッズ係数 |
| 線形サポートベクターマシン (LinearSVC) | ✅ | SVMの係数。 |
| ランダムフォレスト (RandomForest) | ❌ | 代わりに、特徴量の重要度を使用してください。 |

**近似処理は行いません**: モデルがネイティブな係数をサポートしていない場合、いかなる出力も生成されません。

### 係数空間（重要）

**すべての係数は、標準化された特徴量空間における値です。**

これは以下のことを意味します。
- 係数は、StandardScalerによる標準化 *後* の特徴量に対応します。
- 値は、1つの標準偏差が増加した場合の影響を表します。
- スケーリングを元に戻して、元の特徴量の単位に戻す試みは行われていません。
- 特徴量間の係数を比較することは意味があります（同じスケールです）。
- 係数と元の特徴量の値を比較することは意味がありません。

### 線形係数によるアーティファクト

線形モデルの実行結果として、`artifacts/linear_coefficients.v1.json`というファイルが生成されます。

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

### マルチクラスサポート

多クラス分類（3つ以上のクラス）の場合、係数は各クラスごとにグループ分けされます。

- 各クラスはそれぞれ固有の係数セットを持ちます。
- クラスラベルは、常に同じ順序でソートされます。
- v1では、クラス間の集計処理は行われません。

### 実行中のメタデータ

`run.json`ファイルには、利用可能な場合は、線形係数の参照情報が含まれています。

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

係数が利用できない場合、これらの項目は完全に省略されます（null値にはなりません）。

### 診断

サポートされていないモデルからは、構造化された診断情報が出力されます。

| Code | 説明. |
| 以下に翻訳します。
```
(No text provided for translation)
``` | 以下に翻訳します。
------------- |
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | このモデルは、係数抽出機能をサポートしていません。 |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | 分類器には、`coef_`という属性がありません。 |
| `FEATURE_NAMES_UNAVAILABLE` | 機能名が解決できませんでした。 |

### 特徴量の重要度と線形係数との比較

| 遺物 | 対応機種。 | 何を示しているのか。 |
| 以下に翻訳します。
----------
The company is committed to providing high-quality products and services.
同社は、高品質な製品とサービスを提供することに尽力しています。 | 以下に翻訳します。
------------------
The company is committed to providing high-quality products and services.
（同社は、高品質な製品とサービスを提供することに尽力しています。） | 以下に翻訳します。
--------------- |
| 特徴量の重要度 (バージョン 0.3.4) | ランダムフォレスト (RandomForest) | ジニ重要度（決定木ベース） |
| 線形係数 (バージョン 0.3.5) | LogisticRegression、LinearSVC | モデルの係数。 |

以下は補完的な機能です。
- アンサンブルモデルでは、特徴量の重要度を活用する。
- 解釈性の高い線形モデルでは、線形係数を利用する。

### 解釈ガイド

ロジスティック回帰（二値分類）の場合：

- 正の係数：特徴量の増加 → 正のクラスである確率の上昇
- 負の係数：特徴量の増加 → 正のクラスである確率の低下
- 係数の大きさ：絶対値が大きいほど、影響が強い。

例：`coefficient = 2.0` は、この特徴量において、標準偏差が1増加すると、対数オッズが2.0増加することを意味します。

---

## 解釈可能性指標 (バージョン 0.3.6 以降)

バージョン3.6では、実行全体の説明可能性に関する出力を一元的にまとめるためのインデックス機能が追加されました。

### 目的

解釈可能性指標は、以下の質問に答えます。「この実行において、どのような解釈可能性に関する出力が存在するか？それらのバージョンは何か？そして、それらはどこに保存されているか？」

新しい計算は一切行いません。既存の情報を紐付け、要約するだけです。

### インデックス・アーティファクト

各実行プロセスにおいて、`artifacts/interpretability.index.v1.json`というファイルが生成されます。

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

### 利用規約

- 存在しないアーティファクトは、`available_artifacts` から**除外**されます（null や false に設定されません）。
- インデックスは、ファイルが実際に存在する場合にのみ、その可用性を主張します。
- 最小限の実行（LogisticRegression）では、`metrics_v1` と `linear_coefficients_v1` が生成されます。
- RandomForest の実行では、`metrics_v1` と `feature_importance_v1` が生成されます。

### 概要内容

要約には、参照データのみが含まれており、数値データは重複して記載されていません。

| 遺物 | 概要：以下の内容を含みます。 |
| 以下に翻訳します。
----------
The company is committed to providing high-quality products and services.
同社は、高品質な製品とサービスを提供することに尽力しています。 | 以下に翻訳します。
------------------
The company is committed to providing high-quality products and services.
（当社は、高品質な製品とサービスを提供することに尽力しています。） |
| metrics_v1 | `metrics_profile`、`accuracy` (run.jsonファイルから取得) |
| 特徴量の重要度 (バージョン1) | `model_family`、`top_k` (名前のみ、最大5個) |
| 線形係数_v1 | `model_family`, `num_classes`, `top_k_by_class` (これらの名前のみ) |

### VS Code コマンド

`RunForge: 最新の解釈可能性インデックスを表示` を使用すると、整形された概要が表示され、個々の成果物に直接アクセスするためのリンクが用意されています。

---

## はじめに

詳細な手順については、[docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) を参照してください。

---

## 契約および関連書類

### 主要文書

| 文書。 | 目的。 |
| The company is committed to providing high-quality products and services.
(会社は、高品質な製品とサービスを提供することに尽力しています。)
---------- | 以下の文章を日本語に翻訳してください。 |
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | RunForgeが信頼を築く方法. |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | 約2～3分間のガイドツアー。 |
| [CONTRACT.md](CONTRACT.md) | 包括的な行動規範。 |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | 第3段階の拡張に関する規定。 |

### 第2段階（凍結状態）

| 文書。 | Scope |
| 以下に翻訳します。
----------
I understand. | The company is committed to providing high-quality products and services.
(会社は、高品質な製品とサービスを提供することに尽力しています。)
------- |
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | 可観測性 |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | 内省。 |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | ユーザーエクスペリエンスの改善。
または、
UXのブラッシュアップ。 |

### フェーズ3（バージョン0.3.6.0以降、開発が停止中）

| 文書。 | Scope |
| 以下に翻訳します。
----------
The company is committed to providing high-quality products and services.
同社は、高品質な製品とサービスを提供することに尽力しています。 | The company is committed to providing high-quality products and services.
(会社は、高品質な製品とサービスを提供することに尽力しています。)
------- |
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | モデルの選択。 |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | ハイパーパラメータとプロファイル。 |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | モデル特性を考慮した評価指標。 |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | 特徴量の重要度 |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | 線形係数 |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | 解釈可能性指標 |

### 未来

予定されている改善点については、[docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) をご参照ください。

---

## フェーズの状況

| Phase | Focus | 状態 |
| The company is committed to providing high-quality products and services.
(会社は、高品質な製品とサービスを提供することに尽力しています。)
------- | The company announced a new partnership with a leading technology firm.
(会社は、大手テクノロジー企業との新たな提携を発表しました。) | 以下に翻訳します。
-------- |
| **Phase 2** | コアトレーニング、可観測性。 | 凍結. |
| **Phase 3** | モデルの選択、解釈可能性。 | **Frozen (v0.3.6.0)** |
| **Phase 4** | TBD | 新しい契約が必要です。 |

フェーズ2およびフェーズ3のすべての保証内容は確定済みです。今後の作業については、フェーズ4の契約が必要です。

---

## ライセンス

マサチューセッツ工科大学
