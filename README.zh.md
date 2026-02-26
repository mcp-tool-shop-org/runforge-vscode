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

采用一键式机器学习训练，具有确定性且基于合约驱动的行为。

**第三阶段（功能与可解释性）已于 v0.3.6.0 版本完成。**
未来的工作将继续在第四阶段的合同框架下进行。

---

## 🛡️ RunForge 承诺

RunForge 是一款经过精心设计的软件，旨在消除“在我这儿能运行”的现象，并提供基于严谨分析的可靠性。

### 我们提供的保障
1. **确定性：** 每次运行都使用固定的种子值。在相同的数据集上，使用相同的预设参数和种子值重新运行，会得到完全相同的模型。
2. **可追溯性：** 每个 `run.json` 记录都包含 Git 提交的 SHA 值、Python 解释器的路径以及使用的扩展版本。您可以追溯任何模型，找到构建它的代码。
3. **可审计性：** 模型、指标和日志等数据以标准格式（JSON、joblib）保存到磁盘。没有隐藏的数据库，也没有对云服务的依赖。

### 这并非是什么
- **并非万能的自动化机器学习工具：** 我们不会猜测您的需求。我们运行的是经过特定配置和可调整的预设方案。
- **并非云平台：** 我们不会将您的数据上传到任何地方。所有操作都在您的 VS Code 工作空间本地进行。

有关完整的信任模型，请参考 [docs/TRUST_MODEL.md] 文件。

### 运行生命周期

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

## 安装

```bash
npm install
npm run compile
```

## 命令

| 命令。 | 描述。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| `RunForge: Train (Standard)` | 使用默认训练配置进行训练。 |
| `RunForge: Train (High Quality)` | 使用 "hq-train" 预设进行训练。 |
| `RunForge: Open Runs` | 查看已完成的训练记录。 |
| `RunForge: Inspect Dataset` | 在训练模型之前，请验证数据集（版本 0.2.2.1 及更高版本）。 |
| `RunForge: Open Latest Run Metadata` | 查看最新运行版本的元数据 (版本 v0.2.2.1 及以上)。 |
| `RunForge: Inspect Model Artifact` | 查看模型文件 model.pkl (版本 v0.2.2.2 及以上) 的流水线结构。 |
| `RunForge: Browse Runs` | 浏览所有带有操作记录的运行记录（摘要、诊断信息、构建产物）。 (版本 0.2.3 及以上) |
| `RunForge: View Latest Metrics` | 查看来自 metrics.v1.json 文件的详细指标数据（版本 0.3.3 及以上）。 |
| `RunForge: View Latest Feature Importance` | 查看随机森林模型的特征重要性（版本 0.3.4 及以上）。 |
| `RunForge: View Latest Linear Coefficients` | 查看线性模型的系数 (版本 0.3.5 及以上)。 |
| `RunForge: View Latest Interpretability Index` | 查看所有可解释性分析结果的统一索引（版本 0.3.6 及以上）。 |
| `RunForge: Export Latest Run as Markdown` | 保存最新一次运行的格式化 Markdown 摘要（版本 0.4.3 及以上）。 |

## 用法

1. 将 `RUNFORGE_DATASET` 环境变量设置为您的 CSV 文件路径。
2. CSV 文件必须包含一个名为 `label` 的列。
3. 通过命令面板运行训练。

---

## 保证 (版本 0.2.1 及以上)

RunForge VS Code 提供可预测、基于合约的机器学习训练。以下保证是经过精心设计并由测试严格验证的。

### 决定论

在相同的数据集、配置和 RunForge 版本的情况下：

- 训练集和验证集的划分在每次运行中保持一致。
- 生成的结果可重复。
- 评估指标的输出结果稳定。

除了那些明确指定了行为的因素之外，不存在任何随机性。

### 标签管理

- 标签列必须明确指定。
- 标签绝不会根据列的位置进行推断。
- 如果标签配置错误或缺失，系统将尽早报错。

### 指标合同

训练过程会输出以下三个指标：

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

不会自动添加额外的字段。
模式扩展需要进行版本控制的变更。

### 模型产物/模型输出

- `model.pkl` 文件始终是一个序列化的 `sklearn.Pipeline` 对象。
- 所有预处理操作（例如，缩放）都已集成在其中。
- 该模型文件是独立的，可以直接用于推理。

无需进行任何外部预处理步骤。

### 缺失数据

- 包含缺失值的行将被无条件地删除。
- 删除的行数会被记录。
- 不会进行任何隐式的缺失值填充。

### 权威信息来源

- 所有 Python 程序的执行逻辑都位于 `python/ml_runner/` 目录下。
- 代码中不存在重复或冗余的实现。
- 测试用例确保 TypeScript 和 Python 代码的行为一致。

### 稳定政策

- v0.2.1版本的行为已确定，不再进行修改。
- 任何可能导致不兼容的更改都需要明确地升级主版本号。
- 任何未明确告知用户的行为变更将被视为错误。

---

## 非目标（有意为之）

RunForge 目前不具备以下功能：

- 自动选择模型（用户必须明确选择）。
- 调整超参数（默认值已根据预设配置固定）。
- 进行在线或增量式训练。
- 通过启发式方法隐藏训练过程。

准确性和透明度优先于自动化。

---

---

## 可观察性 (版本 v0.2.2.1 及以上)

版本 2.2.1 增加了一些功能，可以查看训练过程的详细信息，但不会改变训练的行为方式。

### 运行元数据

每次训练过程都会生成一个名为 `run.json` 的文件，其中包含以下信息：

- 运行ID和时间戳
- 数据集指纹（SHA-256）
- 标签列和特征数量
- 删除的行数
- 指标快照
- 产物文件路径

### 数据集检查

在训练模型之前，请检查数据集。

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

返回列名、行数、特征数量以及标签验证信息。

### 溯源追踪

所有运行记录都已在 `.runforge/index.json` 文件中进行索引，以便追踪。

- 针对给定的 `model.pkl` 文件，追溯到运行的元数据。
- 查找与特定数据集指纹相关的所有运行记录。
- 仅支持追加操作的索引（不会重新排序或删除数据）。

---

## Artifact 自检功能 (版本 0.2.2.2 及以上)

第二阶段2.2.2版本增加了对已训练模型的只读查看功能。

**查看模式仅供阅读，不会重新训练模型或修改任何数据。**

### 流水线检查

在不重新训练模型的情况下，检查 `model.pkl` 文件中的内容。

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

返回结构化的 JSON 数据，包含：

- 流水线步骤（按顺序）
- 步骤类型和模块
- 预处理检测

好的，请提供需要翻译的英文文本。

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

### 诊断

结构化诊断可以解释为什么程序运行会产生特定的结果：

| Code | 描述。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| `MISSING_VALUES_DROPPED` | 由于缺少数据，已删除的行。 |
| `LABEL_NOT_FOUND` | 数据集缺少标签列。 |
| `LABEL_TYPE_INVALID` | 标签列的数据类型无效。 |
| `ZERO_ROWS` | 处理后，数据集中的行数为零。 |
| `ZERO_FEATURES` | 数据集没有特征列。 |
| `LABEL_ONLY_DATASET` | 该数据集仅包含标签列。 |

所有诊断信息都以机器可读的JSON格式提供，无需进行日志解析。

---

## 浏览跑步记录 (版本 0.2.3 及以上)

第二阶段版本2.3新增了统一的运行记录查看器，并提供了便捷的操作功能。

### 使用浏览模式运行

1. 打开命令面板（`Ctrl+Shift+P`）。
2. 运行 `RunForge: 浏览运行记录`。
3. 从列表中选择一个运行记录（按最新时间排序）。
4. 选择一个操作：
- **打开运行记录摘要** — 以可读的 Markdown 格式查看运行记录的元数据。
- **查看诊断信息** — 查看运行期间发生的情况。
- **检查模型文件** — 查看流水线的结构。
- **复制数据集指纹** — 将 SHA-256 值复制到剪贴板。

### 综合诊断

诊断信息来源于 `run.json` 文件中的字段。

| 条件。 | 诊断。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

未来阶段将计划实施全面的、结构化的排放诊断测试。

---

## 模型选择 (版本 0.3.1 及以上)

第三阶段 3.1 在保留第二阶段所有保证的前提下，增加了明确的模型选择功能。

### 支持的型号

| Model | 命令行界面值。 | 描述。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| 逻辑回归。 | `logistic_regression` | 默认、快速、可解释。 |
| 随机森林。 | `random_forest` | Ensemble 可以处理非线性模式。 |
| 线性支持向量机 (Linear Support Vector Machine) | `linear_svc` | 支持向量分类器，基于边距。 |

### 配置

在 VS Code 的设置中，设置模型家族。

```json
{
  "runforge.modelFamily": "random_forest"
}
```

或者，您可以使用设置界面：搜索“RunForge 模型系列”，然后在下拉菜单中进行选择。

### 命令行使用方法

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

“--model” 参数是可选的。 默认值为：`logistic_regression`。

### 来源

所选择的模型系列信息记录在 `run.json` 文件中。

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### 向后兼容性

- 所有第二阶段的运行结果仍然可读。
- 默认行为未改变（使用逻辑回归）。
- 不需要进行任何数据迁移。
- 数据预处理方式保持不变（所有模型都使用 StandardScaler）。

---

## 超参数与训练配置 (版本 0.3.2 及以上)

第三阶段版本3.2增加了对超参数的明确控制以及训练配置文件的功能。

### 培训档案/培训资料

预设配置的参数集，也称为“配置文件”，提供了预先设置好的超参数。

| 简介。 | 描述。 | 理想家庭 (或 示范家庭) |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| `default` | 没有超参数覆盖设置。 | (使用设置) |
| `fast` | 减少迭代次数，以实现快速运行。 | 逻辑回归。 |
| `thorough` | 更多树结构/迭代次数，以获得更好的质量。 | 随机森林。 |

在 VS Code 的设置中进行配置：
```json
{
  "runforge.profile": "fast"
}
```

### 命令行参数超参数

通过命令行界面（CLI）覆盖单个超参数。

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### 优先级规则

当同时设置了配置文件和命令行参数时：

1. **命令行参数 `--param`** (优先级最高)
2. **配置文件中的参数设置**
3. **模型默认参数** (优先级最低)

### 来源；出处；来历

超参数和配置信息会被记录在 `run.json` 文件中。

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

当未使用任何配置文件时，配置文件中的所有字段都会被完全省略（不为空）。

---

## 模型感知指标 (版本 0.3.3 及以上)

第三阶段3.3版本增加了详细的模型相关指标，并支持基于能力特征的配置选择。

### 指标配置文件

性能指标配置文件会根据模型的具体功能自动进行选择。

| 简介。 | 描述。 | 指标。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| `classification.base.v1` | 所有分类器。 | 准确率、精确率、召回率、F1 值、混淆矩阵。 |
| `classification.proba.v1` | 二元分类 + 预测概率。 | 基准值 + ROC-AUC，对数损失。 |
| `classification.multiclass.v1` | 3个或更多课程。 | 基准值 + 每个类别的精确率/召回率/F1分数。 |

### 配置文件选择逻辑

- 二元分类 + `predict_proba` → `classification.proba.v1`
- 多分类（3个或更多类别）→ `classification.multiclass.v1`
- 其他情况 → `classification.base.v1`

### 模型功能

| Model | 预测概率。 | 决策函数。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| 逻辑回归。 | ✅ | ✅ |
| 随机森林。 | ✅ | ❌ |
| 线性支持向量机 (LinearSVC) | ❌ | ✅ (仅适用于ROC-AUC指标) |

### 指标数据/指标产出

目前，训练过程会同时生成 `metrics.v1.json` 和 `metrics.json` 两个文件。

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

### 运行元数据

`run.json` 文件现在包含了 `metrics_v1` 指针。

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

### 向后兼容性

- `metrics.json` (第二阶段) 文件保持不变。
- 所有现有工具继续正常工作。
- `run.json` 文件中的配置字段要么全部显示，要么完全不显示。

---

## 特征重要性 (版本 0.3.4 及以上)

版本 3.4 增加了对支持的模型的可读性特征重要性提取功能。

### 支持的型号

特征重要性仅适用于具有原生重要性指标的模型。

| Model | 支持。 | 重要性类型。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| 随机森林。 | ✅ | 吉尼系数重要性。 |
| 逻辑回归。 | ❌ | 不在 v1 版本中。 |
| 线性支持向量机 (LinearSVC) | ❌ | 不在 v1 版本中。 |

**不进行近似计算：** 如果模型不支持原生重要性计算，则不会产生任何输出结果。

### 特征重要性指标

RandomForest 运行会生成名为 `artifacts/feature_importance.v1.json` 的文件。

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

### 运行元数据

`run.json` 文件在可用时会包含特征重要性参考信息。

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

当特征重要性信息不可用时，这些字段将完全省略（不显示空值）。

### 诊断

不支持的型号会输出结构化的诊断信息：

| Code | 描述。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | 该模型不支持原生特征重要性评估功能。 |
| `FEATURE_NAMES_UNAVAILABLE` | 无法解析特征名称。 |

### 暂不支持 (在版本 1 中)

以下内容明确不在 v1 的支持范围内：

- 基于系数的重要性评估（适用于线性模型）
- SHAP/LIME 解释方法
- 置换重要性评估
- 偏相关图

### 支持的超参数

**逻辑回归：**
- `C` (浮点数，> 0)：正则化强度。
- `max_iter` (整数，> 0)：最大迭代次数。
- `solver` (字符串)：优化算法。
- `warm_start` (布尔值)：是否重用之前的解。

**随机森林：**
- `n_estimators` (整数，> 0)：树的数量
- `max_depth` (整数或 None)：最大树深度
- `min_samples_split` (整数，>= 2)：进行分割的最小样本数
- `min_samples_leaf` (整数，> 0)：每个叶节点的最小样本数

**线性支持向量机 (Linear SVC):**
- `C` (浮点数, > 0): 正则化强度。
- `max_iter` (整数, > 0): 最大迭代次数。

---

## 线性系数 (版本 0.3.5 及以上)

第三阶段的3.5版本新增了线性分类器的只读系数提取功能。

### 支持的型号

对于具有原生 `coef_` 属性的模型，可以获取线性系数。

| Model | 支持。 | 系数类型 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| 逻辑回归模型。 | ✅ | 对数优势系数。 |
| 线性支持向量机 (LinearSVC) | ✅ | SVM 系数。 |
| 随机森林。 | ❌ | 请使用“特征重要性”功能。 |

**不进行近似计算：** 如果模型不支持原生系数，则不会产生任何错误或异常信息。

### 系数空间 (重要)

所有系数均采用标准化后的特征空间。

这意味着：
- 系数对应于经过 StandardScaler 缩放后的特征。
- 值表示每个标准差的增加所带来的影响程度。
- 没有尝试将缩放值“还原”回原始特征的单位。
- 比较不同特征的系数是有意义的（因为它们在相同的尺度上）。
- 将系数与原始特征值进行比较是没有意义的。

### 线性系数引起的伪影

线性模型运行会生成名为 `artifacts/linear_coefficients.v1.json` 的文件。

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

### 多类别支持

对于多分类问题（3个类别或更多），系数会按照类别进行分组：

- 每个类别都有其自身的一组系数。
- 类别标签以确定性的方式排序。
- v1 版本中不进行跨类别的聚合操作。

### 运行元数据

`run.json` 文件包含线性系数的引用信息，如果可用的话。

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

当系数不可用时，这些字段将完全省略（不显示空值）。

### 诊断

不支持的模型会输出结构化的诊断信息：

| Code | 描述。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | 该模型不支持提取系数。 |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | 分类器对象没有名为 "coef_" 的属性。 |
| `FEATURE_NAMES_UNAVAILABLE` | 无法解析特征名称。 |

### 特征重要性与线性系数的比较

| 文物 | 支持的型号。 | 它展示的内容。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| 特征重要性 (版本 0.3.4) | 随机森林。 | 基尼重要性（基于树的模型）。 |
| 线性系数 (版本 0.3.5) | LogisticRegression，LinearSVC。 | 模型系数。 |

以下是互补的方法：
- 对于集成模型，可以使用特征重要性进行分析。
- 对于可解释的线性模型，可以使用线性系数进行分析。

### 解读指南

对于逻辑回归模型（二元分类）：
- 正系数：特征值增加 → 属于正类的概率更高。
- 负系数：特征值增加 → 属于正类的概率更低。
- 系数的绝对值大小：数值越大，对结果的影响越大。

示例：`coefficient = 2.0` 表示在这个特征上，标准差增加1，则对数几率增加2.0。

---

## 可解释性指标 (版本 0.3.6 及以上)

版本 3.6 增加了一个统一的索引功能，该功能将所有运行的可解释性输出结果链接在一起。

### 目的

可解释性指标能够回答以下问题：“本次运行产生了哪些可解释性输出？它们的版本是什么？这些输出位于何处？”

无需进行新的计算，只是将已有的信息进行关联和总结。

### 索引条目；索引标识

每次运行都会生成一个名为 `artifacts/interpretability.index.v1.json` 的文件：

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

### 可用性规则

- 缺失的指标数据将被**排除**在 `available_artifacts` 列表中（不会被设置为 null 或 false）。
- 索引只会声明文件可用，如果文件实际存在。
- 最小化的运行（例如 LogisticRegression）将包含 `metrics_v1` 和 `linear_coefficients_v1`。
- RandomForest 运行将包含 `metrics_v1` 和 `feature_importance_v1`。

### 摘要内容

摘要仅包含参考数据，不包含任何重复的数值。

| 文物。 | 概要：包含以下内容。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| 指标版本1.0 | `metrics_profile`，`accuracy` (来自 run.json 文件) |
| 特征重要性（版本1） | `model_family`、`top_k` (仅限名称，最多5个)。 |
| 线性系数 (版本 1) | `model_family`、`num_classes`、`top_k_by_class` (仅为参数名称) |

### VS Code 命令

使用“RunForge：查看最新可解释性指标”功能，可以查看一个格式化的摘要，其中包含快速链接，方便您直接打开各个相关文件。

---

## 入门指南

如需了解详细的操作步骤，请参考 [docs/WALKTHROUGH.md] 文件。

---

## 合同及相关文件

### 核心文件

| 文档。 | 目的。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | RunForge 如何建立信任？ |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | 时长2-3分钟的导览。 |
| [CONTRACT.md](CONTRACT.md) | 完整的行为规范协议。 |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | 第三阶段的扩展规则。 |

### 第二阶段（已冻结）

| 文档。 | Scope |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | 可观察性。 |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | 内省。 |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | 用户体验优化。 |

### 第三阶段（截至 v0.3.6.0 版本已停止开发）

| 文档。 | Scope |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | 模型选择。 |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | 超参数与配置信息。 |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | 模型感知指标。 |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | 特征重要性。 |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | 线性系数。 |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | 可解释性指标。 |

### 未来

请参阅 [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) 文件，了解已计划的改进措施。

---

## 阶段状态

| Phase | Focus | 状态。 |
| 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 | 好的，请提供需要翻译的英文文本。 |
| **Phase 2** | 核心培训，可观察性。 | 冰冻。 |
| **Phase 3** | 模型选择，可解释性。 | **Frozen (v0.3.6.0)** |
| **Phase 4** | TBD | 需要新的合同。 |

第二阶段和第三阶段的所有保障措施已确定，后续工作需要签订第四阶段的合同。

---

## 许可

麻省理工学院。
