<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

**面向 v1.0.1 Marketplace 用户的通知 (2026年3月25日发布):** v1.0.1 版本包含五个关键的生产级错误，这些错误会影响 `Train` 命令、浏览功能以及可观察性视图（根本原因：子进程调用存在回归问题，以及写入器和读取器之间的路径/结构不匹配）。这五个错误都已在 **v1.1.0** 版本中修复，该版本还提供了第四阶段的功能（取消正在进行的训练、恢复功能、工作区信任）。如果您安装了 v1.0.1 版本，请升级到 v1.1.0 版本。请参阅 [v1.0.1 发布说明](docs/MARKETPLACE_NOTE_v1.0.1.md) 和 [`CHANGELOG.md`](CHANGELOG.md#110---2026-04-25) 以获取详细信息。

通过按钮实现的机器学习训练，具有确定性和基于合同的行为。

**第三阶段（功能和可解释性）已在 v0.3.6.0 版本中冻结。
第四阶段（生命周期和恢复）已在 v1.1.0 版本中发布** — 请参阅 [第四阶段合同](CONTRACT-PHASE-4.md)。

## v1.1.0 版本的更新内容

1. **取消正在进行的训练** (`RunForge: Cancel Active Training`) — 通过命令面板或 VS Code 的进度通知取消按钮来取消正在运行的训练。 5 秒的优雅 SIGTERM 窗口，然后是 SIGKILL。已取消的运行会添加一个 `.cancelled` 标记，以便恢复功能和运行选择器可以正确地对它们进行分类。
2. **恢复索引** (`RunForge: Recover Index`) — 扫描 `.ml/runs/` 目录，并将任何缺失于 `.ml/outputs/index.json` 中的运行重新追加。 该操作是幂等的。 在写入出现错误或工作区移动后很有用。
3. **工作区信任保护** — 启动 Python 子进程现在需要 `vscode.workspace.isTrusted`。 对于不受信任的工作区，会显示一个可操作的 SafeError 错误，指向“管理工作区信任”的 UI 界面。
4. **每个 epoch 的进度通知** — 训练过程会显示实时进度，并通过 `vscode.window.withProgress` 暴露一个取消按钮。
5. **增强的 CSV 错误消息** — 对于非逗号分隔符、非 UTF-8 编码、所有值为 NaN 的标签、单列 CSV 文件以及仅包含标题的 CSV 文件，都会显示特定的、可操作的诊断信息，而不是 pandas 的不透明的跟踪信息。
6. **自定义 ESLint 规则** — 强制执行 `[`docs/CONTRACTS.md`](docs/CONTRACTS.md)` 中编码的架构原则（禁止重复的规范值字面量，禁止在消费者模块中使用隐式类型）。
7. **架构文档** — `[`docs/CONTRACTS.md`](docs/CONTRACTS.md)` 现在记录了六条架构规则 + 来自五个迭代的结构化审计的七个操作模式。 这些模式对于任何跨域（TS / Python / 可观察性）工作都是不可协商的。

此外，v1.1.0 版本修复了 v1.0.1 版本中的所有五个关键回归问题 (`F-COORD-003`, `F-COORD-004`, `F-COORD-008`, `F-COORD-010`, `F-COORD-011`)。 请参阅 [`CHANGELOG.md`](CHANGELOG.md) 以获取详细信息。

---

## 🛡️ RunForge 的承诺

RunForge 是一款具有特定功能的软件，旨在用“在我机器上可以运行”替换为具有法医证据的确定性。

### 我们提供的承诺
1. **确定性**: 每次运行都会设置种子。 使用相同的种子和相同的数据重新运行相同的预设，会得到完全相同的模型。
2. **溯源性**: 每个 `run.json` 记录都包含 Git 提交 SHA、Python 解释器路径和扩展版本。 您可以将任何模型追溯到构建它的代码。
3. **可审计性**: 构件（模型、指标、日志）以标准格式（JSON、joblib）保存到磁盘。 没有隐藏的数据库，没有云依赖。

### 这不包括
- **不是一个神奇的 AutoML 工具**: 我们不会猜测您想要什么。 我们运行特定的、可调的预设。
- **不是一个云平台**: 我们不会将您的数据发送到任何地方。 所有的操作都在您的 VS Code 工作区中本地进行。

有关完整的信任模型，请参阅 [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md)。

### 安全性和数据范围

**涉及的数据：** 工作空间中的 CSV 文件（仅读，用于训练），`.ml/` 目录（包含元数据、模型文件和指标 JSON 文件），Python 子进程的标准输出/标准错误输出。**未涉及的数据：** 工作空间外的任何文件，任何浏览器数据，任何操作系统凭据。**所需权限：** 仅限于工作空间的文件系统读/写权限，Python 子进程执行权限。**无网络出站连接**——所有操作都是本地的。**不收集或发送任何遥测数据**。

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

## 安装

```bash
npm install
npm run compile
```

## 命令

| 命令 | 描述 |
|---------|-------------|
| `RunForge: Train (Standard)` | 使用 `std-train` 预设进行训练 |
| `RunForge: Train (High Quality)` | 使用 `hq-train` 预设进行训练 |
| `RunForge: Open Runs` | 查看已完成的训练运行 |
| `RunForge: Inspect Dataset` | 在训练之前验证数据集 (v0.2.2.1+) |
| `RunForge: Open Latest Run Metadata` | 查看最近运行的元数据 (v0.2.2.1+) |
| `RunForge: Inspect Model Artifact` | 查看 `model.pkl` 文件的流水线结构 (v0.2.2.2+) |
| `RunForge: Browse Runs` | 浏览所有带有操作的运行（摘要、诊断、模型文件）(v0.2.3+) |
| `RunForge: View Latest Metrics` | 查看 `metrics.v1.json` 文件中的详细指标 (v0.3.3+) |
| `RunForge: View Latest Feature Importance` | 查看随机森林模型的特征重要性 (v0.3.4+) |
| `RunForge: View Latest Linear Coefficients` | 查看线性模型的系数 (v0.3.5+) |
| `RunForge: View Latest Interpretability Index` | 查看所有可解释性模型文件的统一索引 (v0.3.6+) |
| `RunForge: Export Latest Run as Markdown` | 保存最近运行的格式化 Markdown 摘要 (v0.4.3+) |

## 用法

1. 将 `RUNFORGE_DATASET` 环境变量设置为您的 CSV 文件路径。
2. CSV 文件必须包含一个名为 `label` 的列。
3. 通过命令面板进行训练。

---

## 保证 (v0.2.1+)

RunForge VS Code 提供基于合同的、可预测的机器学习训练。 以下保证是明确的，并且通过测试强制执行。

### 可预测性

给定相同的数据集、配置和 RunForge 版本：

- 训练/验证数据集的划分在所有运行中都相同。
- 生成的模型文件可重现。
- 指标输出稳定。

除了明确设置的随机行为之外，没有其他随机性。

### 标签处理

- 标签列是明确指定的。
- 标签绝不会根据列的位置进行推断。
- 配置错误或缺少标签会导致训练失败。

### 指标合同

训练输出正好三个指标：

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

- 不会添加任何其他字段。
- 模式扩展需要版本化的合同变更。

### 模型文件

- `model.pkl` 始终是序列化的 `sklearn.Pipeline` 对象。
- 所有预处理（例如，缩放）都已嵌入。
- 模型文件是自包含的，并且可以直接用于推理。

不需要任何外部预处理步骤。

### 缺失数据

- 包含缺失值的行会被确定性地删除。
- 删除的行数会被记录。
- 不会进行任何隐式的填充。

### 数据来源

- 所有 Python 执行逻辑都位于 `python/ml_runner/` 目录中。
- 不存在任何重复或隐藏的实现。
- 测试确保 TypeScript 和 Python 行为的一致性。

### 稳定性策略

- v0.2.1 的行为被冻结。
- 破坏性更改需要明确的主版本号升级。
- 任何静默的行为更改都被视为错误。

---

## 非目标（有意）

RunForge 当前不尝试：

- 自动选择模型（用户必须明确选择）。
- 调整超参数（默认值是每个预设固定的）。
- 执行在线或增量训练。
- 通过启发式方法隐藏训练行为。

正确性和透明度优先于自动化。

---

---

## 可观察性 (v0.2.2.1+)

版本 2.2.1 增加了对训练运行的可视化，而不会改变训练行为。

### 运行元数据

每个训练过程会生成一个 `run.json` 文件，其中包含：

- 运行 ID 和时间戳
- 数据集指纹 (SHA-256)
- 标签列和特征数量
- 删除的行数
- 指标快照
- 资源路径

### 数据集检查

在训练之前检查数据集：

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

返回列名、行数、特征数量以及标签验证信息。

### 溯源跟踪

所有运行都以索引方式存储在 `.ml/outputs/index.json` 文件中，以便进行追溯：

- 针对给定的 `model.pkl` 文件，可以追溯到运行元数据。
- 可以查找具有特定数据集指纹的所有运行。
- 索引仅支持追加操作（不会重新排序或删除）。

---

## 资源检查 (v0.2.2.2+)

版本 2.2.2 增加了对训练后资源的只读检查功能。

**资源检查为只读模式，不会重新训练或修改资源。**

### 流水线检查

在不重新训练的情况下，检查 `model.pkl` 文件的内部内容：

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

返回结构化的 JSON 数据，其中包含：

- 流水线步骤（按顺序）
- 步骤类型和模块
- 预处理检测信息

示例输出：

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

### 诊断信息

结构化的诊断信息可以解释为什么运行会以某种方式进行：

| 代码 | 描述 |
|------|-------------|
| `MISSING_VALUES_DROPPED` | 由于缺失值而删除的行数 |
| `LABEL_NOT_FOUND` | 数据集缺少标签列 |
| `LABEL_TYPE_INVALID` | 标签列的数据类型无效 |
| `ZERO_ROWS` | 数据集在处理后没有行 |
| `ZERO_FEATURES` | 数据集没有特征列 |
| `LABEL_ONLY_DATASET` | 数据集只包含标签列 |

所有诊断信息都是机器可读的 JSON 格式（无需解析日志）。

---

## 浏览运行 (v0.2.3+)

版本 2.3 增加了统一的运行浏览器，并提供了快速操作功能。

### 使用运行浏览器

1. 打开命令面板 (`Ctrl+Shift+P`)
2. 运行 `RunForge: 浏览运行`
3. 从列表中选择一个运行（按最新时间排序）
4. 选择一个操作：
- **打开运行摘要** — 查看运行元数据，以可读的 Markdown 格式显示
- **查看诊断信息** — 查看运行期间发生的情况
- **检查模型资源** — 查看流水线结构
- **复制数据集指纹** — 将 SHA-256 复制到剪贴板

### 合成诊断信息

诊断信息是从 `run.json` 字段中派生而来：

| 条件 | 诊断信息 |
|-----------|------------|
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

计划在未来的阶段提供完整的结构化诊断信息。

---

## 模型选择 (v0.3.1+)

版本 3.1 增加了显式模型选择功能，同时保留了所有版本 2 的保证。

### 支持的模型

| 模型 | CLI 值 | 描述 |
|-------|-----------|-------------|
| 逻辑回归 | `logistic_regression` | 默认，快速，易于理解 |
| 随机森林 | `random_forest` | 集成模型，可以处理非线性模式 |
| 线性支持向量机 | `linear_svc` | 支持向量分类器，基于边距 |

### 配置

在 VS Code 设置中设置模型系列：

```json
{
  "runforge.modelFamily": "random_forest"
}
```

或者使用设置 UI：搜索 "RunForge 模型系列"，然后从下拉列表中选择。

### CLI 使用

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

`--model` 参数是可选的。 默认值：`logistic_regression`。

### 溯源

所选的模型系列会记录在 `run.json` 文件中：

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### 向后兼容性

- 所有版本 2 的运行仍然可以读取。
- 默认行为未改变（逻辑回归）。
- 不需要进行任何迁移。
- 预处理保持不变（所有模型都使用 StandardScaler）。

---

## 超参数和训练配置文件 (v0.3.2+)

版本 3.2 增加了对超参数的显式控制以及训练配置文件。

### 训练配置文件

预设配置的参数集，也称为“配置文件”，提供了预先定义的超参数。

| 简介。 | 描述 | 理想家庭/示范家庭。 |
|---------|-------------|--------------|
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

### 溯源

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

| 简介。 | 描述 | 指标。 |
|---------|-------------|---------|
| `classification.base.v1` | 所有分类器。 | 准确率、精确率、召回率、F1 值、混淆矩阵。 |
| `classification.proba.v1` | 二元分类 + 预测概率。 | 基准值 + ROC-AUC，对数损失。 |
| `classification.multiclass.v1` | 3个或更多课程。 | 基准值 + 每个类别的精确率/召回率/F1值。 |

### 配置文件选择逻辑

- 二元分类 + `predict_proba` → `classification.proba.v1`
- 多分类（3个或更多类别）→ `classification.multiclass.v1`
- 其他情况 → `classification.base.v1`

### 模型功能

| 模型 | 预测概率。 | 决策函数。 |
|-------|---------------|-------------------|
| 逻辑回归。 | ✅ | ✅ |
| 随机森林。 | ✅ | ❌ |
| 线性支持向量机 (LinearSVC) | ❌ | ✅ (仅适用于ROC-AUC指标) |

### 指标数据产物

目前，训练过程会同时生成两个文件：`metrics.v1.json` 和 `metrics.json`。

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

### 向后兼容性

- `metrics.json` (第二阶段) 文件保持不变。
- 所有现有工具继续正常工作。
- `run.json` 文件中的配置字段要么全部出现，要么完全不出现。

---

## 特征重要性 (版本 0.3.4 及以上)

版本 3.4 增加了对支持的模型的可读性特征重要性提取功能。

### 支持的模型

特征重要性仅适用于具有原生重要性指标的模型。

| 模型 | 支持。 | 重要性类型。 |
|-------|-----------|-----------------|
| 随机森林。 | ✅ | 吉尼系数重要性。 |
| 逻辑回归。 | ❌ | 不在 v1 版本中。 |
| 线性支持向量机 (LinearSVC) | ❌ | 不在 v1 版本中。 |

**不进行近似计算：** 如果模型不支持原生重要性计算，则不会产生任何输出结果。

### 特征重要性指标

RandomForest 算法的运行会生成名为 `artifacts/feature_importance.v1.json` 的文件，其中包含特征重要性信息。

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

### 诊断信息

不支持的型号会输出结构化的诊断信息：

| 代码 | 描述 |
|------|-------------|
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | 该模型不支持原生特征重要性评估功能。 |
| `FEATURE_NAMES_UNAVAILABLE` | 无法解析特征名称。 |

### 该功能在 v1 版本中不受支持

以下内容明确不在 v1 的支持范围内：

- 基于系数的重要性评估（适用于线性模型）
- SHAP/LIME 解释方法
- 置换重要性评估
- 部分依赖关系图

### 支持的超参数

**逻辑回归：**
- `C` (浮点数，> 0)：正则化强度
- `max_iter` (整数，> 0)：最大迭代次数
- `solver` (字符串)：优化算法
- `warm_start` (布尔值)：是否重用之前的解。

**随机森林：**
- `n_estimators` (int, > 0): 树的数量
- `max_depth` (int 或 None): 最大树深度
- `min_samples_split` (int, >= 2): 分割所需的最小样本数
- `min_samples_leaf` (int, > 0): 每个叶节点的最小样本数

**线性支持向量机 (Linear SVC)：**
- `C` (float, > 0): 正则化强度
- `max_iter` (int, > 0): 最大迭代次数

---

## 线性系数 (v0.3.5+)

3.5 版本增加了线性分类器的只读系数提取功能。

### 支持的模型

对于具有原生 `coef_` 属性的模型，可以获取线性系数。

| 模型 | 支持。 | 系数类型 |
|-------|-----------|------------------|
| 逻辑回归。 | ✅ | 对数几率系数 |
| 线性支持向量机 (LinearSVC) | ✅ | 支持向量机系数 |
| 随机森林。 | ❌ | 请使用特征重要性代替。 |

**无近似：** 如果模型不支持原生系数，则不会生成任何相关文件。

### 系数空间 (重要)

**所有系数都位于标准化特征空间中。**

这意味着：
- 系数对应于经过 StandardScaler 处理后的特征。
- 值表示每个标准差增加的影响程度。
- 不会尝试将缩放还原为原始特征单位。
- 比较不同特征的系数是有意义的（使用相同的尺度）。
- 比较系数与原始特征值的比较没有意义。

### 线性系数文件

线性模型运行会生成 `artifacts/linear_coefficients.v1.json` 文件：

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

### 多分类支持

对于多分类问题（3 个或更多类别），系数按类别分组：

- 每个类别都有自己的一组系数。
- 类别标签按确定性顺序排序。
- v1 版本中不进行跨类别的聚合。

### 运行元数据

`run.json` 文件包含线性系数的引用（如果可用）。

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

如果不可用，则这些字段将完全省略（不使用 null 值）。

### 诊断信息

不支持的型号会输出结构化的诊断信息：

| 代码 | 描述 |
|------|-------------|
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | 模型不支持系数提取。 |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | 分类器没有 `coef_` 属性。 |
| `FEATURE_NAMES_UNAVAILABLE` | 无法解析特征名称。 |

### 特征重要性与线性系数

| 文件 | 支持的模型 | 显示内容 |
|----------|------------------|---------------|
| 特征重要性 (v0.3.4) | 随机森林。 | Gini 重要性（基于树的模型） |
| 线性系数 (v0.3.5) | 逻辑回归、线性支持向量机 | 模型系数 |

这些是互补的：
- 对于集成模型，请使用特征重要性。
- 对于可解释的线性模型，请使用线性系数。

### 解释指南

对于逻辑回归（二元）：
- 正系数：特征增加 → 正类别的概率更高。
- 负系数：特征增加 → 正类别的概率更低。
- 绝对值大小：越大，影响越大。

示例：`coefficient = 2.0` 表示该特征增加 1 个标准差 → 对数几率增加 2.0。

---

## 可解释性索引 (v0.3.6+)

3.6 版本添加了一个统一的索引文件，该文件将所有运行的可解释性输出链接在一起。

### 目的

可解释性索引回答的问题是：“对于此运行，存在哪些可解释性输出，它们的版本是什么，以及它们位于何处？”

不进行任何新的计算，只是链接和汇总现有的文件。

### 索引文件

每个运行都会生成 `artifacts/interpretability.index.v1.json` 文件：

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

- 缺失的文件将从 `available_artifacts` 中**省略**（不设置为 null 或 false）。
- 只有当文件实际存在时，索引才会声明其可用性。
- 最小的运行（逻辑回归）将包含 `metrics_v1` 和 `linear_coefficients_v1`。
- 随机森林运行将包含 `metrics_v1` 和 `feature_importance_v1`。

### 摘要内容

概要仅包含参考数据（不包含重复的数值）。

| 文件 | 概要内容 |
|----------|------------------|
| metrics_v1 | `metrics_profile`、`accuracy`（来自 run.json 文件） |
| feature_importance_v1 | `model_family`、`top_k`（仅限名称，最多 5 个） |
| linear_coefficients_v1 | `model_family`、`num_classes`、`top_k_by_class`（仅限名称） |

### VS Code 命令

使用 `RunForge: 查看最新可解释性指标`，可以查看格式化的概要，其中包含快速链接，用于打开各个文件。

---

## 入门

有关详细的步骤指南，请参阅 [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)。

---

## 协议与文档

### 核心文档

| 文档 | 目的 |
|----------|---------|
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | RunForge 如何建立信任 |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | 简短的 2-3 分钟导览 |
| [CONTRACT.md](CONTRACT.md) | 完整的行为规范 |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | 第三阶段的扩展规则 |

### 第二阶段（已冻结）

| 文档 | 范围 |
|----------|-------|
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | 可观察性 |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | 内省 |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | 用户体验优化 |

### 第三阶段（截至 v0.3.6.0 版本已冻结）

| 文档 | 范围 |
|----------|-------|
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | 模型选择 |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | 超参数与配置 |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | 与模型相关的指标 |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | 特征重要性 |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | 线性系数 |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | 可解释性指标 |

### 未来

有关计划中的改进，请参阅 [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md)。

---

## 阶段状态

| 阶段 | 重点 | 状态 |
|-------|-------|--------|
| **Phase 2** | 核心训练、可观察性 | 已冻结 |
| **Phase 3** | 模型选择、可解释性 | **Frozen (v0.3.6.0)** |
| **Phase 4** | 生命周期、恢复、原则 | **已发布 (v1.1.0)** — 参见 [`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) |

**所有第二阶段、第三阶段和第四阶段的协议内容已锁定。未来的工作需要第五阶段的协议。**

---

## 许可证

MIT

---

由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
