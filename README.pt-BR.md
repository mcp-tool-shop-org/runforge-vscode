<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
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

> **Aviso para usuários da Marketplace na versão v1.0.1 (lançamento de 25 de março de 2026):** A versão v1.0.1 foi lançada com cinco
> bugs CRÍTICOS que afetam os comandos `Train`, a execução de testes e as visualizações de monitoramento
> (a causa raiz foi uma regressão na invocação de sub processos e uma incompatibilidade de caminho/estrutura entre
> o escritor e os leitores). Todos os cinco foram corrigidos na **v1.1.0**, que também oferece os recursos da Fase 4
> (cancelamento em andamento, recuperação e confiança do ambiente de trabalho). Se você instalou a versão v1.0.1,
> atualize para a versão v1.1.0. Consulte as [notas de lançamento da v1.0.1](docs/MARKETPLACE_NOTE_v1.0.1.md)
> e o [`CHANGELOG.md`](CHANGELOG.md#110---2026-04-25) para obter detalhes.

Treinamento de modelos de aprendizado de máquina com um único clique, com comportamento determinístico e baseado em contratos.

> **A Fase 3 (Capacidades e Interpretabilidade) foi finalizada na versão v0.3.6.0.
> A Fase 4 (Ciclo de Vida e Recuperação) foi lançada na versão v1.1.0** — veja o [contrato da Fase 4](CONTRACT-PHASE-4.md).

## O que há de novo na v1.1.0

1. **Cancelar treinamento em andamento** (`RunForge: Cancelar Treinamento Ativo`) — cancele um treinamento em execução
através do Painel de Comandos ou do botão de cancelamento de notificação de progresso do VS Code. Janela de 5 segundos
para um encerramento gracioso (SIGTERM), seguido de SIGKILL. As execuções canceladas recebem um marcador `.cancelled` para que
a recuperação e o seletor de execuções possam classificá-las corretamente.
2. **Recuperar Índice** (`RunForge: Recuperar Índice`) — percorre o diretório `.ml/runs/` e reapende qualquer execução
que esteja ausente do arquivo `.ml/outputs/index.json`. Idempotente. Útil após uma falha na escrita ou uma
mudança no ambiente de trabalho.
3. **Proteção de confiança do ambiente de trabalho** — a execução de sub processos Python agora requer
`vscode.workspace.isTrusted`. Ambientes de trabalho não confiáveis recebem uma mensagem de erro informativa que
direciona para a interface de gerenciamento de confiança do ambiente de trabalho.
4. **Notificações de progresso por época** — o treinamento exibe o progresso em tempo real e exibe um botão de
cancelamento através de `vscode.window.withProgress`.
5. **Mensagens de erro de CSV aprimoradas** — delimitadores que não são vírgulas, codificações que não são UTF-8,
rótulos totalmente NaN, arquivos CSV de coluna única e arquivos CSV com apenas cabeçalho exibem diagnósticos
específicos e acionáveis, em vez de rastreamentos opacos do pandas.
6. **Regras personalizadas do ESLint** que impõem as doutrinas arquiteturais codificadas em
[`docs/CONTRACTS.md`](docs/CONTRACTS.md) (sem duplicação de literais de valor canônico, sem tipos
sombra em módulos de consumidor).
7. **Documentação da doutrina** — [`docs/CONTRACTS.md`](docs/CONTRACTS.md) agora codifica as
seis regras arquiteturais + sete padrões operacionais de cinco ciclos de auditoria estruturada. Os padrões são
innegociáveis para qualquer trabalho entre domínios (TS / Python / monitoramento).

Além disso, a versão v1.1.0 corrige todos os cinco bugs CRÍTICOS da v1.0.1 (`F-COORD-003`, `F-COORD-004`,
`F-COORD-008`, `F-COORD-010`, `F-COORD-011`). Consulte o [`CHANGELOG.md`](CHANGELOG.md) para obter
uma descrição detalhada.

---

## 🛡️ A Garantia RunForge

RunForge é um software com opiniões definidas, projetado para substituir a frase "funciona na minha máquina" por
certeza forense.

### O que garantimos
1.  **Determinismo**: Cada execução é inicializada. A reexecução da mesma configuração com a mesma inicialização nos mesmos dados produz o mesmo modelo.
2.  **Rastreabilidade**: Cada registro `run.json` inclui o SHA do commit do Git, o caminho do interpretador Python e a versão da extensão usados. Você pode rastrear qualquer modelo até o código que o criou.
3.  **Auditabilidade**: Artefatos (modelos, métricas, logs) são salvos em disco em formatos padrão (JSON, joblib). Não há bancos de dados ocultos, nem dependências de nuvem.

### O que isso não é
-   **Não é uma ferramenta de AutoML mágica**: Não adivinhamos o que você quer. Executamos configurações específicas e ajustáveis.
-   **Não é uma plataforma em nuvem**: Não enviamos seus dados para lugar nenhum. Tudo acontece localmente no seu ambiente de trabalho do VS Code.

Para o modelo de confiança completo, consulte [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md).

### Segurança e Escopo de Dados

**Dados acessados:** arquivos CSV do espaço de trabalho (somente leitura para treinamento), diretório `.ml/` (metadados de execução, artefatos do modelo, JSON de métricas), saída padrão/erro padrão de subprocessos Python. **Dados NÃO acessados:** nenhum arquivo fora do espaço de trabalho, nenhum dado do navegador, nenhuma credencial do sistema operacional. **Permissões necessárias:** leitura/escrita no sistema de arquivos apenas dentro do espaço de trabalho, execução de subprocessos Python. **Não há saída de rede** — todas as operações são locais. **Nenhuma telemetria** é coletada ou enviada.

### Ciclo de vida de uma execução

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

## Instalação

```bash
npm install
npm run compile
```

## Comandos

| Comando | Descrição |
|---------|-------------|
| `RunForge: Train (Standard)` | Executar treinamento com o preset padrão "std-train" |
| `RunForge: Train (High Quality)` | Executar treinamento com o preset "hq-train" |
| `RunForge: Open Runs` | Visualizar execuções de treinamento concluídas |
| `RunForge: Inspect Dataset` | Validar o conjunto de dados antes do treinamento (v0.2.2.1+) |
| `RunForge: Open Latest Run Metadata` | Visualizar os metadados da execução mais recente (v0.2.2.1+) |
| `RunForge: Inspect Model Artifact` | Visualizar a estrutura do pipeline do arquivo "model.pkl" (v0.2.2.2+) |
| `RunForge: Browse Runs` | Navegar por todas as execuções com ações (resumo, diagnóstico, artefato) (v0.2.3+) |
| `RunForge: View Latest Metrics` | Visualizar métricas detalhadas do arquivo "metrics.v1.json" (v0.3.3+) |
| `RunForge: View Latest Feature Importance` | Visualizar a importância das características para modelos RandomForest (v0.3.4+) |
| `RunForge: View Latest Linear Coefficients` | Visualizar os coeficientes para modelos lineares (v0.3.5+) |
| `RunForge: View Latest Interpretability Index` | Visualizar o índice unificado de todos os artefatos de interpretabilidade (v0.3.6+) |
| `RunForge: Export Latest Run as Markdown` | Salvar um resumo formatado em Markdown da execução mais recente (v0.4.3+) |

## Uso

1. Defina a variável de ambiente `RUNFORGE_DATASET` para o caminho do seu arquivo CSV.
2. O arquivo CSV deve ter uma coluna chamada `label`.
3. Execute o treinamento através do Command Palette (Paleta de Comandos).

---

## Garantias (v0.2.1+)

O RunForge para VS Code oferece treinamento de aprendizado de máquina determinístico e baseado em contratos. As garantias abaixo são intencionais e aplicadas por meio de testes.

### Determinismo

Dado o mesmo conjunto de dados, configuração e versão do RunForge:

- As divisões de treinamento/validação são idênticas em todas as execuções.
- Os artefatos gerados são reproduzíveis.
- As saídas de métricas são estáveis.

Não há aleatoriedade fora do comportamento explicitamente definido.

### Tratamento de rótulos

- A coluna de rótulos é especificada explicitamente.
- O rótulo nunca é inferido pela posição da coluna.
- Configurações incorretas ou rótulos ausentes resultam em falhas precoces.

### Contrato de métricas

O treinamento gera exatamente três métricas:

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

Nenhum campo adicional é adicionado implicitamente.
A expansão do esquema requer uma alteração de contrato versionada.

### Artefatos do modelo

- `model.pkl` é sempre um objeto serializado `sklearn.Pipeline`.
- Todo o pré-processamento (por exemplo, escalonamento) é incorporado.
- O artefato é autônomo e pronto para inferência.

Não são necessários passos de pré-processamento externos.

### Dados ausentes

- Linhas contendo valores ausentes são descartadas de forma determinística.
- O número de linhas descartadas é registrado.
- Nenhuma imputação silenciosa ocorre.

### Fonte da verdade

- Toda a lógica de execução em Python reside em `python/ml_runner/`.
- Não há implementação duplicada ou alternativa.
- Os testes garantem a consistência entre o comportamento do TypeScript e do Python.

### Política de estabilidade

- O comportamento na versão v0.2.1 está fixo.
- Alterações que quebram a compatibilidade exigem um aumento explícito da versão principal.
- Alterações de comportamento silenciosas são consideradas bugs.

---

## Objetivos não alcançados (intencionalmente)

O RunForge atualmente não tenta:

- Selecionar modelos automaticamente (o usuário deve escolher explicitamente).
- Ajustar hiperparâmetros (os valores padrão são fixos para cada preset).
- Realizar treinamento online ou incremental.
- Ocultar o comportamento do treinamento por trás de heurísticas.

A correção e a transparência têm prioridade sobre a automação.

---

---

## Observabilidade (v0.2.2.1+)

A versão 2.2.1 adiciona visibilidade às execuções de treinamento sem alterar o comportamento do treinamento.

### Metadados da execução

Cada execução de treinamento gera um arquivo `run.json` contendo:

- ID da execução e carimbo de data/hora
- Impressão digital do conjunto de dados (SHA-256)
- Coluna de rótulos e número de características
- Número de linhas descartadas
- Snapshot das métricas
- Caminhos dos artefatos

### Inspeção do Conjunto de Dados

Inspeccione os conjuntos de dados antes do treinamento:

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Retorna os nomes das colunas, o número de linhas, o número de características e a validação dos rótulos.

### Rastreamento da Origem

Todas as execuções são indexadas em `.ml/outputs/index.json` para rastreabilidade:

- Dada uma `model.pkl`, rastreie até os metadados da execução.
- Encontre todas as execuções para uma determinada impressão digital do conjunto de dados.
- Índice somente de adição (nunca reorganiza ou exclui).

---

## Inspeção de Artefatos (v0.2.2.2+)

A fase 2.2.2 adiciona a inspeção somente de leitura dos artefatos treinados.

**A inspeção é somente de leitura e não retreina nem modifica os artefatos.**

### Inspeção do Pipeline

Inspeccione o conteúdo de um `model.pkl` sem retreinar:

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Retorna um JSON estruturado com:

- Etapas do pipeline (na ordem)
- Tipos de etapa e módulos
- Detecção de pré-processamento

Exemplo de saída:

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

### Diagnósticos

Diagnósticos estruturados explicam por que uma execução se comportou da maneira que se comportou:

| Código | Descrição |
|------|-------------|
| `MISSING_VALUES_DROPPED` | Linhas descartadas devido a valores ausentes |
| `LABEL_NOT_FOUND` | Coluna de rótulos não presente no conjunto de dados |
| `LABEL_TYPE_INVALID` | Coluna de rótulos tem um tipo inválido |
| `ZERO_ROWS` | O conjunto de dados não tem linhas após o processamento |
| `ZERO_FEATURES` | O conjunto de dados não tem colunas de características |
| `LABEL_ONLY_DATASET` | O conjunto de dados contém apenas a coluna de rótulos |

Todos os diagnósticos são JSON legíveis por máquina (não é necessário analisar logs).

---

## Navegação de Execuções (v0.2.3+)

A fase 2.3 adiciona um navegador de execuções unificado com ações rápidas.

### Usando o Navegador de Execuções

1. Abra a Paleta de Comandos (`Ctrl+Shift+P`)
2. Execute `RunForge: Navegar Execuções`
3. Selecione uma execução da lista (a mais recente primeiro)
4. Escolha uma ação:
- **Abrir Resumo da Execução** — Visualize os metadados da execução em formato Markdown legível
- **Ver Diagnósticos** — Veja o que aconteceu durante a execução
- **Inspeccionar Artefato do Modelo** — Visualize a estrutura do pipeline
- **Copiar Impressão Digital do Conjunto de Dados** — Copie o SHA-256 para a área de transferência

### Diagnósticos Sintetizados

Os diagnósticos são derivados dos campos do arquivo `run.json`:

| Condição | Diagnóstico |
|-----------|------------|
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

A emissão completa de diagnósticos estruturados está planejada para fases futuras.

---

## Seleção de Modelo (v0.3.1+)

A fase 3.1 adiciona a seleção explícita de modelo, preservando todas as garantias da fase 2.

### Modelos Suportados

| Modelo | Valor do CLI | Descrição |
|-------|-----------|-------------|
| Regressão Logística | `logistic_regression` | Padrão, rápido, interpretável |
| Floresta Aleatória | `random_forest` | Conjunto, lida com padrões não lineares |
| SVC Linear | `linear_svc` | Classificador de vetores de suporte, baseado em margem |

### Configuração

Defina a família de modelos nas configurações do VS Code:

```json
{
  "runforge.modelFamily": "random_forest"
}
```

Ou use a interface de usuário de configurações: procure por "RunForge Model Family" e selecione na lista suspensa.

### Uso do CLI

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

O argumento `--model` é opcional. Padrão: `logistic_regression`.

### Origem

A família de modelos selecionada é registrada no arquivo `run.json`:

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Compatibilidade com Versões Anteriores

- Todas as execuções da fase 2 permanecem legíveis
- O comportamento padrão não foi alterado (regressão logística)
- Nenhuma migração é necessária
- O pré-processamento permanece fixo (StandardScaler para todos os modelos)

---

## Hiperparâmetros e Perfis de Treinamento (v0.3.2+)

A fase 3.2 adiciona o controle explícito de hiperparâmetros e perfis de treinamento.

### Perfis de Treinamento

Perfis nomeados fornecem hiperparâmetros pré-configurados:

| Perfil | Descrição | Família de Modelos |
|---------|-------------|--------------|
| `default` | Nenhum hiperparâmetro sobrescrito | (usa a configuração) |
| `fast` | Menos iterações para execuções rápidas | regressão_logística |
| `thorough` | Mais árvores/iterações para melhor qualidade | floresta_aleatória |

Configure nas configurações do VS Code:
```json
{
  "runforge.profile": "fast"
}
```

### Hiperparâmetros da Linha de Comando (CLI)

Sobrescreva hiperparâmetros individuais via CLI:

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Regras de Prioridade

Quando tanto o perfil quanto os parâmetros da CLI estão definidos:

1. **`--param` da CLI** (maior prioridade)
2. **Parâmetros expandidos pelo perfil**
3. **Padrões do modelo** (menor prioridade)

### Origem

Os hiperparâmetros e perfis são registrados em `run.json`:

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

Quando nenhum perfil é usado, os campos do perfil são completamente omitidos (não nulos).

---

## Métricas Específicas do Modelo (v0.3.3+)

A versão 3.3 adiciona métricas detalhadas e específicas do modelo, com seleção de perfil baseada em capacidades.

### Perfis de Métricas

Os perfis de métricas são selecionados automaticamente com base nas capacidades do modelo:

| Perfil | Descrição | Métricas |
|---------|-------------|---------|
| `classification.base.v1` | Todos os classificadores | precisão, exatidão, revocação, f1, matriz de confusão |
| `classification.proba.v1` | Binário + predict_proba | básico + ROC-AUC, log loss |
| `classification.multiclass.v1` | 3+ classes | básico + precisão/revocação/f1 por classe |

### Lógica de Seleção de Perfil

- Classificação binária + `predict_proba` → `classification.proba.v1`
- Multiclasse (3+ classes) → `classification.multiclass.v1`
- Caso contrário → `classification.base.v1`

### Capacidades do Modelo

| Modelo | predict_proba | decision_function |
|-------|---------------|-------------------|
| RegressãoLogística | ✅ | ✅ |
| FlorestaAleatória | ✅ | ❌ |
| LinearSVC | ❌ | ✅ (apenas ROC-AUC) |

### Artefato de Métricas

O treinamento agora produz `metrics.v1.json` junto com `metrics.json`:

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

### Metadados da execução

`run.json` agora inclui um ponteiro para `metrics_v1`:

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

### Compatibilidade com Versões Anteriores

- `metrics.json` (versão 2) permanece inalterado
- Todas as ferramentas existentes continuam a funcionar
- Os campos do perfil em `run.json` aparecem juntos ou não aparecem.

---

## Importância das Características (v0.3.4+)

A versão 3.4 adiciona extração de importância das características somente leitura para modelos suportados.

### Modelos Suportados

A importância das características está disponível apenas para modelos com sinais de importância nativos:

| Modelo | Suportado | Tipo de Importância |
|-------|-----------|-----------------|
| FlorestaAleatória | ✅ | Importância de Gini |
| RegressãoLogística | ❌ | Não disponível na v1 |
| LinearSVC | ❌ | Não disponível na v1 |

**Sem aproximações**: Se o modelo não suportar a importância nativa, nenhum artefato é gerado.

### Artefato de Importância das Características

As execuções da FlorestaAleatória produzem `artifacts/feature_importance.v1.json`:

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

### Metadados da execução

`run.json` inclui uma referência à importância das características, quando disponível:

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

Quando a importância das características não está disponível, esses campos são completamente omitidos (não nulos).

### Diagnósticos

Modelos não suportados emitem diagnósticos estruturados:

| Código | Descrição |
|------|-------------|
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | O modelo não suporta a importância nativa das características |
| `FEATURE_NAMES_UNAVAILABLE` | Os nomes das características não puderam ser resolvidos |

### Não suportado na v1

Os seguintes itens estão explicitamente fora do escopo da versão 1:

- Importância baseada em coeficientes para modelos lineares
- Explicações SHAP/LIME
- Importância por permutação
- Gráficos de dependência parcial

### Hiperparâmetros Suportados

**Regressão Logística:**
- `C` (float, > 0): Força de regularização
- `max_iter` (int, > 0): Número máximo de iterações
- `solver` (str): Solucionador de otimização
- `warm_start` (bool): Reutilizar a solução anterior

**Floresta Aleatória:**
- `n_estimators` (int, > 0): Número de árvores
- `max_depth` (int ou None): Profundidade máxima da árvore
- `min_samples_split` (int, >= 2): Número mínimo de amostras para dividir
- `min_samples_leaf` (int, > 0): Número mínimo de amostras por folha

**SVC Linear:**
- `C` (float, > 0): Intensidade da regularização
- `max_iter` (int, > 0): Número máximo de iterações

---

## Coeficientes Lineares (v0.3.5+)

A fase 3.5 adiciona a extração de coeficientes somente leitura para classificadores lineares.

### Modelos Suportados

Os coeficientes lineares estão disponíveis para modelos com o atributo nativo `coef_`:

| Modelo | Suportado | Tipo de Coeficiente |
|-------|-----------|------------------|
| RegressãoLogística | ✅ | Coeficientes de log-odds |
| LinearSVC | ✅ | Coeficientes de SVM |
| FlorestaAleatória | ❌ | Use Importância das Características em vez disso |

**Sem aproximações**: Se o modelo não suportar coeficientes nativos, nenhum artefato é gerado.

### Espaço de Coeficientes (IMPORTANTE)

**Todos os coeficientes estão no espaço de características PADRONIZADO.**

Isso significa:
- Os coeficientes correspondem às características APÓS a aplicação do StandardScaler
- Os valores representam a influência por cada desvio padrão de aumento
- Não é feita nenhuma tentativa de "inverter" a escala para as unidades originais da característica
- Comparar coeficientes entre diferentes características é significativo (mesma escala)
- Comparar coeficientes com os valores originais das características NÃO é significativo

### Artefato de Coeficientes Lineares

As execuções de modelos lineares geram o arquivo `artifacts/linear_coefficients.v1.json`:

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

### Suporte para Classificação Multiclasse

Para classificação multiclasse (3 ou mais classes), os coeficientes são agrupados por classe:

- Cada classe tem seu próprio conjunto de coeficientes
- Os rótulos das classes são ordenados de forma determinística
- Não há agregação entre classes na versão 1

### Metadados da execução

O arquivo `run.json` inclui a referência aos coeficientes lineares, quando disponíveis:

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

Quando os coeficientes não estão disponíveis, esses campos são completamente omitidos (não definidos como nulos).

### Diagnósticos

Modelos não suportados emitem diagnósticos estruturados:

| Código | Descrição |
|------|-------------|
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | O modelo não suporta a extração de coeficientes |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | O classificador não possui o atributo `coef_` |
| `FEATURE_NAMES_UNAVAILABLE` | Os nomes das características não puderam ser resolvidos |

### Importância das Características vs. Coeficientes Lineares

| Artefato | Modelos Suportados | O que ele mostra |
|----------|------------------|---------------|
| Importância das Características (v0.3.4) | FlorestaAleatória | Importância de Gini (baseada em árvores) |
| Coeficientes Lineares (v0.3.5) | Regressão Logística, SVC Linear | Coeficientes do modelo |

Estes são complementares:
- Use a Importância das Características para modelos de conjunto
- Use os Coeficientes Lineares para modelos lineares interpretáveis

### Guia de Interpretação

Para Regressão Logística (binária):
- Coeficiente positivo: Aumento da característica → Maior probabilidade da classe positiva
- Coeficiente negativo: Aumento da característica → Menor probabilidade da classe positiva
- Magnitude: Valor absoluto maior = Maior influência

Exemplo: `coeficiente = 2.0` significa +1 desvio padrão nesta característica → +2.0 para os log-odds

---

## Índice de Interpretabilidade (v0.3.6+)

A fase 3.6 adiciona um artefato de índice unificado que vincula todas as saídas de interpretabilidade para uma execução.

### Propósito

O índice de interpretabilidade responde: "Quais saídas de interpretabilidade existem para esta execução, quais são as versões e onde estão?"

Não há novo cálculo - apenas vinculação e resumo de artefatos existentes.

### Artefato do Índice

Cada execução gera o arquivo `artifacts/interpretability.index.v1.json`:

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

### Regras de Disponibilidade

- Artefatos ausentes são **omitidos** de `available_artifacts` (não são definidos como nulos ou falsos)
- O índice só afirma a disponibilidade se o arquivo realmente existir
- Uma execução mínima (Regressão Logística) terá `metrics_v1` e `linear_coefficients_v1`
- Uma execução de Floresta Aleatória terá `metrics_v1` e `feature_importance_v1`

### Conteúdo do Resumo

Os resumos incluem apenas dados de referência (sem valores numéricos duplicados):

| Artefato | Resumo Contém |
|----------|------------------|
| métricas_v1 | `metrics_profile`, `accuracy` (do arquivo run.json) |
| feature_importance_v1 | `model_family`, `top_k` (apenas os nomes, máximo de 5) |
| linear_coefficients_v1 | `model_family`, `num_classes`, `top_k_by_class` (apenas os nomes) |

### Comando do VS Code

Use `RunForge: View Latest Interpretability Index` para ver um resumo formatado com links rápidos para abrir os artefatos individuais.

---

## Primeiros Passos

Para um guia passo a passo, consulte [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

---

## Contrato e Documentação

### Documentos Principais

| Documento | Propósito |
|----------|---------|
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | Como o RunForge estabelece a confiança |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | Visita guiada de 2 a 3 minutos |
| [CONTRACT.md](CONTRACT.md) | Contrato comportamental completo |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | Regras de expansão da Fase 3 |

### Fase 2 (Congelada)

| Documento | Escopo |
|----------|-------|
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | Observabilidade |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | Introspecção |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | Aprimoramentos de UX |

### Fase 3 (Congelada a partir da versão v0.3.6.0)

| Documento | Escopo |
|----------|-------|
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | Seleção de modelo |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | Hiperparâmetros e perfis |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | Métricas específicas para o modelo |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | Importância das características |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | Coeficientes lineares |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | Índice de interpretabilidade |

### Futuro

Consulte [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) para ver as melhorias planejadas.

---

## Status da Fase

| Fase | Foco | Status |
|-------|-------|--------|
| **Phase 2** | Treinamento principal, observabilidade | Congelada |
| **Phase 3** | Seleção de modelo, interpretabilidade | **Frozen (v0.3.6.0)** |
| **Phase 4** | Ciclo de vida, recuperação, doutrina | **Lançada (v1.1.0)** — consulte [`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) |

**Todas as interfaces de contrato das Fases 2, 3 e 4 estão bloqueadas. Trabalhos futuros exigem um contrato da Fase 5.**

---

## Licença

MIT

---

Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
