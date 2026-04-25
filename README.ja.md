<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

**v1.0.1マーケットプレイス利用者の皆様へ (2026年3月25日リリース):** v1.0.1には、`Train`コマンド、ブラウジング機能、および可観測性ビューを停止させる、5つの重大なバグが含まれていました (原因: サブプロセスの呼び出しに関する問題と、書き込み側と読み込み側のパス/構造の不一致)。これらの5つのバグはすべて、**v1.1.0**で修正されました。v1.1.0では、Phase 4の機能 (処理中のタスクのキャンセル、リカバリ機能、ワークスペースの信頼性) も提供されます。v1.0.1をインストールした場合は、v1.1.0にアップグレードしてください。詳細については、[v1.0.1のリリースノート](docs/MARKETPLACE_NOTE_v1.0.1.md)と[`CHANGELOG.md`](CHANGELOG.md#110---2026-04-25)をご覧ください。

ボタン一つで実現する、決定論的で契約駆動型の機械学習トレーニング。

**Phase 3 (機能と解釈可能性): v0.3.6.0で固定。
Phase 4 (ライフサイクルとリカバリ): v1.1.0でリリース** - [Phase 4の契約](CONTRACT-PHASE-4.md)を参照してください。

## v1.1.0の主な変更点

1. **処理中のトレーニングのキャンセル** (`RunForge: Cancel Active Training`): コマンドパレットまたはVS Codeの進捗状況通知のキャンセルボタンから、実行中のトレーニングをキャンセルできます。5秒間の猶予期間 (SIGTERM) があり、その後は強制終了 (SIGKILL) されます。キャンセルされた実行には`.cancelled`というマーカーが追加され、リカバリ機能や実行選択機能が正しく分類できるようにします。
2. **インデックスのリカバリ** (`RunForge: Recover Index`): `.ml/runs/`ディレクトリをスキャンし、`.ml/outputs/index.json`ファイルに存在しない実行を再追加します。冪等性があります。クラッシュした書き込みやワークスペースの移動後に役立ちます。
3. **ワークスペースの信頼性チェック**: Pythonのサブプロセス起動には、`vscode.workspace.isTrusted`が必要です。信頼されていないワークスペースでは、問題箇所を指すアクション可能なSafeErrorが表示されます。
4. **エポックごとの進捗通知**: トレーニングの進捗状況をリアルタイムで表示し、`vscode.window.withProgress`を通じてキャンセルボタンを表示します。
5. **改善されたCSVエラーメッセージ**: カンマ以外の区切り文字、UTF-8以外のエンコーディング、すべてのラベルがNaN (欠損値) の場合、単一列のCSVファイル、ヘッダーのみのCSVファイルなど、それぞれ特定の、アクション可能な診断情報を表示し、従来のpandasのエラーメッセージを表示しません。
6. **カスタムESLintルール**: [`docs/CONTRACTS.md`](docs/CONTRACTS.md)に記述されているアーキテクチャの原則を強制します (カノニカル値のリテラル重複なし、コンシューマーモジュールでの型シャドウイングなし)。
7. **アーキテクチャドキュメント**: [`docs/CONTRACTS.md`](docs/CONTRACTS.と記述されている6つのアーキテクチャルールと、5つの段階で実施された構造化監査から得られた7つの運用パターンがまとめられています。これらのパターンは、ドメインを跨いだ (TS / Python / 可観測性) ワークにおいて、変更できません。

さらに、v1.1.0では、v1.0.1の5つの重大なバグ (`F-COORD-003`, `F-COORD-004`, `F-COORD-008`, `F-COORD-010`, `F-COORD-011`) がすべて修正されています。詳細については、[`CHANGELOG.md`](CHANGELOG.md)をご覧ください。

---

## 🛡️ RunForgeの保証

RunForgeは、特定の要件を満たすように設計されたソフトウェアであり、「私の環境では動く」という問題を、検証可能な形で解決します。

### 保証内容
1. **決定論**: すべての実行にはシード値が設定されています。同じ設定で同じデータを使用し、同じシード値で再実行すると、常に同じモデルが生成されます。
2. **トレーサビリティ**: すべての`run.json`レコードには、GitコミットのSHA、Pythonインタープリターのパス、および拡張機能のバージョンが含まれています。どのモデルも、それを構築したコードまで追跡できます。
3. **監査可能性**: アーティファクト (モデル、メトリック、ログ) は、標準の形式 (JSON、joblib) でディスクに保存されます。隠されたデータベースやクラウドへの依存はありません。

### これは以下の機能ではありません
- **魔法の自動機械学習ツールではありません**: ユーザーが何をしたいかを推測しません。特定の、調整可能な設定を使用します。
- **クラウドプラットフォームではありません**: データをどこにも送信しません。すべてがローカルのVS Codeワークスペースで行われます。

完全な信頼モデルについては、[docs/TRUST_MODEL.md](docs/TRUST_MODEL.md)を参照してください。

### セキュリティとデータ範囲

**アクセスされるデータ:** ワークスペースのCSVファイル（トレーニング時は読み取り専用）、`.ml/`ディレクトリ（実行メタデータ、モデルアーティファクト、メトリクスJSON）、Pythonサブプロセスの標準出力/標準エラー出力。**アクセスされないデータ:** ワークスペース外のファイル、ブラウザデータ、OSの認証情報。**必要な権限:** ワークスペース内でのファイルシステムの読み取り/書き込み、Pythonサブプロセスの実行。**外部ネットワークへのアクセスはありません** — すべての操作はローカルで行われます。**テレメトリは収集または送信されません。**

### 実行のライフサイクル

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

## インストール

```bash
npm install
npm run compile
```

## コマンド

| コマンド | 説明 |
|---------|-------------|
| `RunForge: Train (Standard)` | 標準のトレーニングプリセットを使用してトレーニングを実行 |
| `RunForge: Train (High Quality)` | ハイパフォーマンスのトレーニングプリセットを使用してトレーニングを実行 |
| `RunForge: Open Runs` | 完了したトレーニング実行を表示 |
| `RunForge: Inspect Dataset` | トレーニング前にデータセットを検証（v0.2.2.1以降） |
| `RunForge: Open Latest Run Metadata` | 最新の実行のメタデータを表示（v0.2.2.1以降） |
| `RunForge: Inspect Model Artifact` | モデルの`model.pkl`ファイルのパイプライン構造を表示（v0.2.2.2以降） |
| `RunForge: Browse Runs` | すべての実行のアクション（概要、診断、アーティファクト）を表示（v0.2.3以降） |
| `RunForge: View Latest Metrics` | `metrics.v1.json`ファイルから詳細なメトリクスを表示（v0.3.3以降） |
| `RunForge: View Latest Feature Importance` | ランダムフォレストモデルのフィーチャ重要度を表示（v0.3.4以降） |
| `RunForge: View Latest Linear Coefficients` | 線形モデルの係数を表示（v0.3.5以降） |
| `RunForge: View Latest Interpretability Index` | すべての解釈可能性アーティファクトの統合インデックスを表示（v0.3.6以降） |
| `RunForge: Export Latest Run as Markdown` | 最新の実行の書式設定されたMarkdown形式の概要を保存（v0.4.3以降） |

## 使用方法

1. `RUNFORGE_DATASET`環境変数をCSVファイルのパスに設定します。
2. CSVファイルには、`label`という名前の列が必要です。
3. コマンドパレットからトレーニングを実行します。

---

## 保証（v0.2.1以降）

RunForge VS Codeは、決定論的で、契約に基づいた機械学習トレーニングを提供します。以下に示す保証は意図的なものであり、テストによって強制されます。

### 決定論性

同じデータセット、構成、およびRunForgeのバージョンの場合：

- トレーニング/検証の分割は、すべての実行で同一です。
- 生成されたアーティファクトは再現可能です。
- メトリクスの出力は安定しています。

明示的にシードされていないランダム性は存在しません。

### ラベルの取り扱い

- ラベルの列は明示的に指定されます。
- ラベルは列の位置によって推測されることはありません。
- 誤った構成または欠落したラベルの場合、早期にエラーが発生します。

### メトリクスの契約

トレーニングは、正確に3つのメトリクスを出力します。

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

追加のフィールドは暗黙的に追加されません。
スキーマの拡張には、バージョン管理された契約の変更が必要です。

### モデルアーティファクト

- `model.pkl`は常にシリアライズされた`sklearn.Pipeline`です。
- すべての前処理（例：スケーリング）が組み込まれています。
- アーティファクトは自己完結型であり、推論の準備ができています。

外部の前処理ステップは必要ありません。

### 欠損データ

- 欠損値を含む行は、決定論的に削除されます。
- 削除された行の数は記録されます。
- 暗黙的な補完は行われません。

### 真実の源

- すべてのPython実行ロジックは`python/ml_runner/`にあります。
- 重複またはシャドウ実装はありません。
- TypeScriptとPythonの動作の整合性をテストによって強制します。

### 安定性ポリシー

- v0.2.1の動作は固定されています。
- 破壊的な変更には、明示的なメジャーバージョンの変更が必要です。
- 静かな動作の変更はバグと見なされます。

---

## 非目標（意図的）

RunForgeは、現在以下のことを試みません。

- モデルを自動的に選択する（ユーザーは明示的に選択する必要があります）。
- ハイパーパラメータを調整する（デフォルト値は各プリセットごとに固定されています）。
- オンラインまたはインクリメンタルなトレーニングを実行する。
- トレーニングの動作をヒューリスティックで隠蔽する。

正確性と透明性が、自動化よりも優先されます。

---

---

## 可観測性（v0.2.2.1以降）

バージョン2.2.1では、トレーニングの動作を変更せずに、トレーニング実行の可視性が向上しました。

### 実行メタデータ

各トレーニング実行ごとに、`run.json`というファイルが生成されます。このファイルには、以下の情報が含まれています。

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

すべての実行結果は、`.ml/outputs/index.json` ファイルにインデックスとして登録されており、追跡が可能です。

- `model.pkl` ファイルから、実行に関するメタデータを追跡します。
- 特定のデータセットのフィンガープリントに一致するすべての実行を検索します。
- 追記専用のインデックスであり、データの並び替えや削除は行われません。

---

## アーティファクトの自己診断機能 (バージョン 0.2.2.2 以降)

バージョン2.2.2では、学習済みのデータやモデルなどを読み取り専用で確認できる機能が追加されました。

**検査機能は読み取り専用であり、学習データの再学習や、生成されたデータの修正は行いません。**

### パイプラインの検査

`model.pkl`ファイルの中身を、モデルを再学習することなく確認する方法：

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

以下の構造を持つJSON形式でデータが返されます：

- パイプラインのステップ（順序）
- ステップの種類とモジュール
- 事前処理の検出

Example output:
例：

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

| コード | 説明 |
|------|-------------|
| `MISSING_VALUES_DROPPED` | 欠損値が含まれるため、行が削除されました。 |
| `LABEL_NOT_FOUND` | データセットにラベル列が存在しません。 |
| `LABEL_TYPE_INVALID` | ラベル列のデータ型が不正です。 |
| `ZERO_ROWS` | データセットを処理した結果、行数が0になりました。 |
| `ZERO_FEATURES` | データセットには特徴量となる列がありません。 |
| `LABEL_ONLY_DATASET` | このデータセットには、ラベル列のみが含まれています。 |

すべての診断データは、機械で読み取り可能なJSON形式で提供されます（ログの解析は不要です）。

---

## ランの閲覧 (v0.2.3以降)

バージョン2.3では、実行履歴をまとめて表示するブラウザが追加され、クイックアクション機能も搭載されています。

### ブラウズ機能の活用方法

1. コマンドパレットを開きます (`Ctrl+Shift+P`)。
2. `RunForge: Browse Runs` を実行します。
3. リストから実行を選択します（最新のものが最初に表示されます）。
4. 以下のいずれかのアクションを選択します。
- **実行サマリーを開く**: 実行に関するメタデータを読みやすいマークダウン形式で表示します。
- **診断情報を表示**: 実行中に発生した内容を確認します。
- **モデルアーティファクトを検査**: パイプラインの構造を表示します。
- **データセットのフィンガープリントをコピー**: SHA-256の値をクリップボードにコピーします。

### 統合診断システム

診断情報は、run.jsonファイル内の以下の項目から取得されます。

| 状態 | 診断。 |
|-----------|------------|
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

詳細な構造診断と排出ガス測定は、今後の段階で実施される予定です。

---

## モデルの選択 (バージョン 0.3.1 以降)

フェーズ3.1では、モデルの選択を明示的に行う機能を新たに追加しつつ、フェーズ2で提供されていたすべての機能と保証を維持しています。

### 対応機種

| モデル | CLIの値。 | 説明 |
|-------|-----------|-------------|
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

または、設定画面を使用することもできます。画面内で「RunForge モデルファミリー」を検索し、ドロップダウンメニューから選択してください。

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

### 互換性（旧機種との）

- フェーズ2のすべての実行結果は引き続き閲覧可能です。
- デフォルトの動作は変更ありません（ロジスティック回帰）。
- マイグレーションは不要です。
- 事前処理の設定は変更ありません（すべてのモデルでStandardScalerを使用）。

---

## ハイパーパラメータとトレーニング設定 (バージョン 0.3.2 以降)

バージョン3.2では、ハイパーパラメータの制御機能と、トレーニング設定のプロファイル機能が追加されました。

### トレーニング プロファイル

名前付きプロファイルは、あらかじめ設定されたハイパーパラメータを提供します。

| プロファイル | 説明 | モデルファミリー |
|---------|-------------|--------------|
| `default` | ハイパーパラメータの上書きは行われません | （設定を使用） |
| `fast` | 高速な実行のために、反復回数を削減 | ロジスティック回帰 |
| `thorough` | より高品質な結果を得るために、木の数または反復回数を増加 | ランダムフォレスト |

VS Codeの設定で構成します。
```json
{
  "runforge.profile": "fast"
}
```

### CLIのハイパーパラメータ

CLI経由で個々のハイパーパラメータを上書きします。

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### 優先順位ルール

プロファイルとCLIパラメータの両方が設定されている場合：

1. **CLIの`--param`**（最優先）
2. **プロファイルで拡張されたパラメータ**
3. **モデルのデフォルト値**（最優先度が低い）

### 来歴。
または、出所

ハイパーパラメータとプロファイルは、`run.json`に記録されます。

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

プロファイルが使用されていない場合、プロファイル関連のフィールドは完全に省略されます（nullではありません）。

---

## モデル対応のメトリクス（v0.3.3以降）

バージョン3.3では、モデルの特性を考慮した詳細なメトリクスと、それに対応したプロファイル選択機能が追加されました。

### メトリクスプロファイル

メトリクスプロファイルは、モデルの機能に基づいて自動的に選択されます。

| プロファイル | 説明 | メトリクス |
|---------|-------------|---------|
| `classification.base.v1` | すべての分類器 | 精度、適合率、再現率、F1スコア、混同行列 |
| `classification.proba.v1` | 二値分類 + 予測確率 | 基本メトリクス + ROC-AUC、対数損失 |
| `classification.multiclass.v1` | 3つ以上のクラス | 基本メトリクス + クラスごとの精度、適合率、再現率、F1スコア |

### プロファイル選択ロジック

- 二値分類 + `predict_proba` → `classification.proba.v1`
- 多クラス（3つ以上のクラス）→ `classification.multiclass.v1`
- それ以外 → `classification.base.v1`

### モデルの機能

| モデル | 予測確率 | 決定関数 |
|-------|---------------|-------------------|
| ロジスティック回帰 | ✅ | ✅ |
| ランダムフォレスト | ✅ | ❌ |
| 線形SVM | ❌ | ✅（ROC-AUCのみ） |

### メトリクスのアートファクト

トレーニング中に、`metrics.v1.json`に加えて`metrics.json`が生成されます。

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

### 実行メタデータ

`run.json`には、メトリクスへの参照である`metrics_v1`が含まれるようになりました。

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

### 互換性（旧機種との）

- `metrics.json`（バージョン2）は変更されません。
- すべての既存のツールは引き続き動作します。
- `run.json`内のプロファイル関連のフィールドは、一緒に表示されるか、全く表示されないかのいずれかです。

---

## 特徴量の重要度（v0.3.4以降）

バージョン3.4では、サポートされているモデルに対して、読み取り専用の特徴量の重要度を抽出する機能が追加されました。

### 対応機種

特徴量の重要度は、ネイティブな重要度信号を持つモデルでのみ利用可能です。

| モデル | サポートされているもの | 重要度の種類 |
|-------|-----------|-----------------|
| ランダムフォレスト | ✅ | ジニ重要度 |
| ロジスティック回帰 | ❌ | v1ではサポートされていません |
| 線形SVM | ❌ | v1ではサポートされていません |

**近似なし**: モデルがネイティブな重要度をサポートしていない場合、アートファクトは生成されません。

### 特徴量の重要度のアートファクト

ランダムフォレストの実行では、`artifacts/feature_importance.v1.json`が生成されます。

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

### 実行メタデータ

`run.json`には、利用可能な場合、特徴量の重要度への参照が含まれます。

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

特徴量の重要度が利用できない場合、これらのフィールドは完全に省略されます（nullではありません）。

### 診断

サポートされていないモデルでは、構造化された診断情報が出力されます。

| コード | 説明 |
|------|-------------|
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | モデルがネイティブな特徴量の重要度をサポートしていません。 |
| `FEATURE_NAMES_UNAVAILABLE` | 特徴量の名前を解決できませんでした。 |

### v1ではサポートされていません

以下は、v1の範囲外です。

- 線形モデルにおける係数に基づく重要度
- SHAP/LIMEによる説明
- パーミュテーション重要度
- パートシャルディペンデンスプロット

### サポートされているハイパーパラメータ

**ロジスティック回帰:**
- `C` (float, > 0): 正則化の強さ
- `max_iter` (int, > 0): 最大反復回数
- `solver` (str): 最適化ソルバー
- `warm_start` (bool): 以前の解を再利用するかどうか

**ランダムフォレスト:**
- `n_estimators` (int, > 0): 決定木の数
- `max_depth` (int or None): 決定木の最大深さ
- `min_samples_split` (int, >= 2): 分割に使用する最小サンプル数
- `min_samples_leaf` (int, > 0): 各リーフノードに必要とする最小サンプル数

**線形SVM:**
- `C` (float, > 0): 正則化の強さ
- `max_iter` (int, > 0): 最大反復回数

---

## 線形係数 (v0.3.5 以降)

バージョン 3.5 以降では、線形分類器の読み取り専用の係数抽出機能が追加されました。

### 対応機種

ネイティブな `coef_` 属性を持つモデルで、線形係数が利用可能です。

| モデル | サポートされているもの | 係数の種類 |
|-------|-----------|------------------|
| ロジスティック回帰 | ✅ | 対数オッズ係数 |
| 線形SVM | ✅ | SVM 係数 |
| ランダムフォレスト | ❌ | 代わりに特徴量の重要度を使用してください。 |

**近似なし:** モデルがネイティブな係数をサポートしていない場合、アーティファクトは生成されません。

### 係数の空間 (重要)

**すべての係数は、標準化された特徴量空間にあります。**

これは、以下のことを意味します。
- 係数は、StandardScaler を適用した後の特徴量に対応します。
- 値は、1 標準偏差の増加あたりの影響を表します。
- スケーリングを元の特徴量単位に戻す試みは行われません。
- 特徴量間で係数を比較することは意味があります (同じスケール)。
- 元の係数値を参照して係数を比較することは意味がありません。

### 線形係数のアーティファクト

線形モデルの実行により、`artifacts/linear_coefficients.v1.json` が生成されます。

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

### 多クラスサポート

多クラス分類 (3つ以上のクラス) の場合、係数はクラスごとにグループ化されます。

- 各クラスには、独自の係数のセットがあります。
- クラスラベルは、決定的にソートされます。
- バージョン 1 では、クラス間の集計は行われません。

### 実行メタデータ

`run.json` には、利用可能な場合、線形係数の参照が含まれています。

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

係数が利用できない場合、これらのフィールドは完全に省略されます (null ではありません)。

### 診断

サポートされていないモデルでは、構造化された診断情報が出力されます。

| コード | 説明 |
|------|-------------|
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | モデルが係数の抽出をサポートしていません。 |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | 分類器が `coef_` 属性を持っていません。 |
| `FEATURE_NAMES_UNAVAILABLE` | 特徴量の名前を解決できませんでした。 |

### 特徴量の重要度と線形係数

| アーティファクト | 対応機種。 | 表示内容 |
|----------|------------------|---------------|
| 特徴量の重要度 (v0.3.4) | ランダムフォレスト | ジニ重要度 (決定木ベース) |
| 線形係数 (v0.3.5) | ロジスティック回帰、線形SVM | モデルの係数 |

これらは補完的なものです。
- アンサンブルモデルには、特徴量の重要度を使用します。
- 解釈可能な線形モデルには、線形係数を使用します。

### 解釈ガイド

ロジスティック回帰 (二値分類) の場合:
- 正の係数: 特徴量の増加 → 正のクラスの確率が上昇
- 負の係数: 特徴量の増加 → 正のクラスの確率が低下
- 振幅: 絶対値が大きいほど、影響が強い

例: `coefficient = 2.0` は、この特徴量で +1 標準偏差 → 対数オッズが +2.0 になることを意味します。

---

## 解釈可能性インデックス (v0.3.6 以降)

バージョン 3.6 以降では、実行全体で利用可能なすべての解釈可能性出力をリンクする、統合されたインデックスアーティファクトが追加されました。

### 目的

解釈可能性インデックスは、次の質問に答えます。「この実行でどのような解釈可能性出力が存在し、どのバージョンで、どこに保存されているか？」

新しい計算は行われず、既存のアーティファクトをリンクして要約するだけです。

### インデックスアーティファクト

各実行で、`artifacts/interpretability.index.v1.json` が生成されます。

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

### 利用可能性ルール

- 存在しないアーティファクトは、`available_artifacts` から**省略**されます (null または false に設定されません)。
- インデックスは、ファイルが実際に存在する場合にのみ、利用可能であることを示します。
- 最小限の実行 (ロジスティック回帰) では、`metrics_v1` と `linear_coefficients_v1` が存在します。
- ランダムフォレストの実行では、`metrics_v1` と `feature_importance_v1` が存在します。

### 概要

概要には、参照データのみが含まれます（数値データは重複しません）。

| アーティファクト | 概要の内容 |
|----------|------------------|
| metrics_v1 | `metrics_profile`、`accuracy`（run.jsonから） |
| feature_importance_v1 | `model_family`、`top_k`（名前のみ、最大5つ） |
| linear_coefficients_v1 | `model_family`、`num_classes`、`top_k_by_class`（名前のみ） |

### VS Code コマンド

`RunForge: View Latest Interpretability Index` を使用すると、書式設定された概要が表示され、個々の成果物を開くためのクイックリンクが提供されます。

---

## はじめに

詳細な手順については、[docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) を参照してください。

---

## 契約とドキュメント

### 主要ドキュメント

| ドキュメント | 目的 |
|----------|---------|
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | RunForge が信頼を確立する方法 |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | 2～3分間のガイダンス |
| [CONTRACT.md](CONTRACT.md) | 完全な行動規範 |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | フェーズ3の拡張ルール |

### フェーズ2（固定）

| ドキュメント | 範囲 |
|----------|-------|
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | 可観測性 |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | 自己診断 |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | ユーザーエクスペリエンスの改善 |

### フェーズ3（v0.3.6.0時点で固定）

| ドキュメント | 範囲 |
|----------|-------|
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | モデル選択 |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | ハイパーパラメータとプロファイル |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | モデル対応のメトリクス |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | 特徴量の重要度 |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | 線形係数 |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | 解釈可能性インデックス |

### 今後の予定

予定されている改善については、[docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) を参照してください。

---

## フェーズの状態

| フェーズ | 重点 | 状態 |
|-------|-------|--------|
| **Phase 2** | コアトレーニング、可観測性 | 固定 |
| **Phase 3** | モデル選択、解釈可能性 | **Frozen (v0.3.6.0)** |
| **Phase 4** | ライフサイクル、復旧、原則 | **リリース済み（v1.1.0）** — [`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) を参照してください。 |

**フェーズ2、フェーズ3、およびフェーズ4のすべての契約内容は固定されています。今後の作業には、フェーズ5の契約が必要です。**

---

## ライセンス

MIT

---

<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> が作成しました。
