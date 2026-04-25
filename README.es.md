<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
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

> **Aviso para usuarios de la tienda (marketplace) en la versión 1.0.1 (lanzamiento del 25 de marzo de 2026):** La versión 1.0.1 se lanzó con cinco errores
> críticos que afectan los comandos de "Entrenamiento", la navegación y las vistas de
> monitoreo (la causa raíz es una regresión en la invocación de subprocesos y una
> discrepancia en la ruta/estructura entre el escritor y los lectores). Los cinco se
> corrigieron en la versión **1.1.0**, que también incluye las funciones de la Fase 4
> (cancelación en curso, recuperación, confianza del espacio de trabajo). Si instaló la
> versión 1.0.1, actualice a la versión 1.1.0. Consulte las [notas de la versión 1.0.1](docs/MARKETPLACE_NOTE_v1.0.1.md)
> y el [`CHANGELOG.md`](CHANGELOG.md#110---2026-04-25) para obtener más detalles.

Entrenamiento de modelos de aprendizaje automático con un solo clic, con un comportamiento determinista y basado en contratos.

> **La Fase 3 (Capacidades e Interpretabilidad) se fijó en la versión 0.3.6.0.
> La Fase 4 (Ciclo de vida y recuperación) se lanzó en la versión 1.1.0**; consulte el [contrato de la Fase 4](CONTRACT-PHASE-4.md).

## ¿Qué hay de nuevo en la versión 1.1.0?

1. **Cancelar el entrenamiento en curso** (`RunForge: Cancelar entrenamiento activo`): cancele un
entrenamiento en ejecución a través del panel de comandos o el botón de cancelación de notificación de progreso de VS Code. Se aplica una ventana de gracia de 5 segundos con SIGTERM, seguida de SIGKILL. Los entrenamientos cancelados reciben un marcador `.cancelled` para que la recuperación y el selector de ejecuciones puedan clasificarlos correctamente.
2. **Recuperar índice** (`RunForge: Recuperar índice`): recorre `.ml/runs/` y vuelve a agregar cualquier ejecución
que falte en `.ml/outputs/index.json`. Es idempotente. Útil después de un error de escritura o un movimiento del espacio de trabajo.
3. **Protección de la confianza del espacio de trabajo**: la creación de subprocesos de Python ahora requiere
`vscode.workspace.isTrusted`. Los espacios de trabajo no confiables muestran un error de seguridad que permite realizar una acción y que dirige a la interfaz de administración de la confianza del espacio de trabajo.
4. **Notificaciones de progreso por época**: el entrenamiento muestra el progreso en tiempo real y expone un botón de
cancelación a través de `vscode.window.withProgress`.
5. **Mensajes de error de CSV mejorados**: los delimitadores que no son comas, las codificaciones que no son UTF-8, las
etiquetas que son todos NaN, los archivos CSV de una sola columna y los archivos CSV que solo contienen encabezados generan diagnósticos específicos y que permiten realizar una acción, en lugar de rastreos opacos de pandas.
6. **Reglas personalizadas de ESLint**: estas reglas hacen cumplir las doctrinas arquitectónicas codificadas en
[`docs/CONTRACTS.md`](docs/CONTRACTS.md) (no hay duplicación de literales de valor canónico, no hay tipos ocultos en los módulos de consumidor).
7. **Documentación de la doctrina**: [`docs/CONTRACTS.md`](docs/CONTRACTS.md) ahora codifica las
seis reglas arquitectónicas + siete patrones operativos de cinco iteraciones de auditoría estructurada. Los patrones son innegociables para cualquier trabajo entre dominios (TS / Python / monitoreo).

Además, la versión 1.1.0 corrige las cinco regresiones CRÍTICAS de la versión 1.0.1 (`F-COORD-003`, `F-COORD-004`,
`F-COORD-008`, `F-COORD-010`, `F-COORD-011`). Consulte el [`CHANGELOG.md`](CHANGELOG.md) para obtener
un desglose completo.

---

## 🛡️ La Garantía de RunForge

RunForge es un software con una opinión definida, diseñado para reemplazar la frase "funciona en mi máquina" con una certeza forense.

### Lo que garantizamos
1.  **Determinismo**: Cada ejecución tiene una semilla. Volver a ejecutar la misma configuración con la misma semilla en los mismos datos produce el mismo modelo.
2.  **Origen**: Cada registro de `run.json` incluye el SHA del commit de Git, la ruta del intérprete de Python y la versión de la extensión utilizados. Puede rastrear cualquier modelo hasta el código que lo creó.
3.  **Auditoría**: Los artefactos (modelos, métricas, registros) se guardan en el disco en formatos estándar (JSON, joblib). No hay bases de datos ocultas, ni dependencias de la nube.

### Lo que esto no es
-   **No es una herramienta de AutoML mágica**: No adivinamos lo que quiere. Ejecutamos configuraciones específicas y ajustables.
-   **No es una plataforma en la nube**: No enviamos sus datos a ningún lugar. Todo se ejecuta localmente en su espacio de trabajo de VS Code.

Para obtener información completa sobre el modelo de confianza, consulte [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md).

### Seguridad y alcance de los datos

**Datos a los que se accede:** archivos CSV del espacio de trabajo (solo lectura para el entrenamiento), directorio `.ml/` (metadatos de la ejecución, artefactos del modelo, JSON de métricas), salida estándar/error estándar de los subprocesos de Python. **Datos a los que NO se accede:** ningún archivo fuera del espacio de trabajo, ningún dato del navegador, ninguna credencial del sistema operativo. **Permisos requeridos:** lectura/escritura en el sistema de archivos dentro del espacio de trabajo, ejecución de subprocesos de Python. **No hay salida de red:** todas las operaciones son locales. **No se recopila ni se envía telemetría.**

### Ciclo de vida de una ejecución

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

## Instalación

```bash
npm install
npm run compile
```

## Comandos

| Comando | Descripción |
|---------|-------------|
| `RunForge: Train (Standard)` | Ejecutar el entrenamiento con la configuración predefinida "std-train" |
| `RunForge: Train (High Quality)` | Ejecutar el entrenamiento con la configuración predefinida "hq-train" |
| `RunForge: Open Runs` | Ver las ejecuciones de entrenamiento completadas |
| `RunForge: Inspect Dataset` | Validar el conjunto de datos antes del entrenamiento (v0.2.2.1+) |
| `RunForge: Open Latest Run Metadata` | Ver los metadatos de la ejecución más reciente (v0.2.2.1+) |
| `RunForge: Inspect Model Artifact` | Ver la estructura del pipeline del archivo "model.pkl" (v0.2.2.2+) |
| `RunForge: Browse Runs` | Explorar todas las ejecuciones con acciones (resumen, diagnóstico, artefacto) (v0.2.3+) |
| `RunForge: View Latest Metrics` | Ver métricas detalladas del archivo "metrics.v1.json" (v0.3.3+) |
| `RunForge: View Latest Feature Importance` | Ver la importancia de las características para los modelos RandomForest (v0.3.4+) |
| `RunForge: View Latest Linear Coefficients` | Ver los coeficientes para los modelos lineales (v0.3.5+) |
| `RunForge: View Latest Interpretability Index` | Ver el índice unificado de todos los artefactos de interpretabilidad (v0.3.6+) |
| `RunForge: Export Latest Run as Markdown` | Guardar un resumen formateado en Markdown de la última ejecución (v0.4.3+) |

## Uso

1. Establecer la variable de entorno `RUNFORGE_DATASET` con la ruta a su archivo CSV.
2. El archivo CSV debe tener una columna llamada `label`.
3. Ejecutar el entrenamiento a través del panel de comandos.

---

## Garantías (v0.2.1+)

RunForge para VS Code proporciona un entrenamiento de aprendizaje automático determinista y basado en contratos. Las garantías a continuación son intencionales y se hacen cumplir mediante pruebas.

### Determinismo

Dado el mismo conjunto de datos, configuración y versión de RunForge:

- Las divisiones de entrenamiento/validación son idénticas en todas las ejecuciones.
- Los artefactos generados son reproducibles.
- Las salidas de las métricas son estables.

No hay aleatoriedad fuera del comportamiento explícitamente definido.

### Manejo de etiquetas

- La columna de etiquetas se especifica explícitamente.
- La etiqueta nunca se infiere por la posición de la columna.
- Las etiquetas mal configuradas o faltantes provocan errores tempranos.

### Contrato de métricas

El entrenamiento genera exactamente tres métricas:

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

No se agregan campos adicionales implícitamente.
La expansión del esquema requiere un cambio de contrato versionado.

### Artefactos del modelo

- `model.pkl` es siempre un objeto serializado de `sklearn.Pipeline`.
- Todo el preprocesamiento (por ejemplo, escalamiento) está incluido.
- El artefacto es autocontenido y listo para la inferencia.

No se requieren pasos de preprocesamiento externos.

### Datos faltantes

- Las filas que contienen valores faltantes se eliminan de forma determinista.
- Se registra el número de filas eliminadas.
- No se realiza ninguna imputación silenciosa.

### Fuente de la verdad

- Toda la lógica de ejecución de Python se encuentra en `python/ml_runner/`.
- No hay implementaciones duplicadas ni alternativas.
- Las pruebas garantizan la coherencia entre el comportamiento de TypeScript y Python.

### Política de estabilidad

- El comportamiento de la versión v0.2.1 está congelado.
- Los cambios que rompen la compatibilidad requieren un aumento explícito de la versión principal.
- Los cambios de comportamiento silenciosos se consideran errores.

---

## Objetivos no alcanzados (intencionales)

RunForge actualmente no intenta:

- Seleccionar modelos automáticamente (el usuario debe elegir explícitamente).
- Ajustar hiperparámetros (los valores predeterminados están fijos para cada configuración).
- Realizar entrenamiento en línea o incremental.
- Ocultar el comportamiento del entrenamiento detrás de heurísticas.

La corrección y la transparencia tienen prioridad sobre la automatización.

---

---

## Observabilidad (v0.2.2.1+)

La versión 2.2.1 agrega visibilidad a las ejecuciones de entrenamiento sin cambiar el comportamiento del entrenamiento.

### Metadatos de la ejecución

Cada ejecución de entrenamiento genera un archivo `run.json` que contiene:

- ID de la ejecución y marca de tiempo
- Huella digital del conjunto de datos (SHA-256)
- Columna de etiquetas y número de características
- Número de filas eliminadas
- Instantánea de las métricas
- Rutas de los artefactos

### Inspección del conjunto de datos

Inspeccione los conjuntos de datos antes del entrenamiento:

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Devuelve los nombres de las columnas, el número de filas, el número de características y la validación de la etiqueta.

### Seguimiento del origen

Todas las ejecuciones están indexadas en `.ml/outputs/index.json` para facilitar el seguimiento:

- Dado un archivo `model.pkl`, rastree la información de la ejecución.
- Encuentre todas las ejecuciones para una huella digital de conjunto de datos determinada.
- Índice de solo escritura (nunca se reordena ni se elimina).

---

## Inspección de artefactos (v0.2.2.2+)

La fase 2.2.2 agrega la inspección de solo lectura de los artefactos entrenados.

**La inspección es de solo lectura y no vuelve a entrenar ni modifica los artefactos.**

### Inspección del flujo de trabajo

Inspeccione el contenido de un archivo `model.pkl` sin volver a entrenar:

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Devuelve un JSON estructurado con:

- Pasos del flujo de trabajo (en orden)
- Tipos de pasos y módulos
- Detección de preprocesamiento

Ejemplo de salida:

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

Los diagnósticos estructurados explican por qué una ejecución se comportó de la manera en que lo hizo:

| Código | Descripción |
|------|-------------|
| `MISSING_VALUES_DROPPED` | Filas eliminadas debido a valores faltantes |
| `LABEL_NOT_FOUND` | La columna de etiquetas no está presente en el conjunto de datos |
| `LABEL_TYPE_INVALID` | La columna de etiquetas tiene un tipo de datos inválido |
| `ZERO_ROWS` | El conjunto de datos tiene cero filas después del procesamiento |
| `ZERO_FEATURES` | El conjunto de datos no tiene columnas de características |
| `LABEL_ONLY_DATASET` | El conjunto de datos contiene solo la columna de etiquetas |

Todos los diagnósticos son JSON legibles por máquina (no se requiere análisis de registros).

---

## Explorar ejecuciones (v0.2.3+)

La fase 2.3 agrega un explorador de ejecuciones unificado con acciones rápidas.

### Cómo usar el explorador de ejecuciones

1. Abra la paleta de comandos (`Ctrl+Shift+P`)
2. Ejecute `RunForge: Explorar ejecuciones`
3. Seleccione una ejecución de la lista (la más reciente primero)
4. Elija una acción:
- **Ver resumen de la ejecución** — Vea los metadatos de la ejecución en formato Markdown legible
- **Ver diagnósticos** — Vea lo que sucedió durante la ejecución
- **Inspeccionar artefacto del modelo** — Vea la estructura del flujo de trabajo
- **Copiar huella digital del conjunto de datos** — Copie el SHA-256 al portapapeles

### Diagnósticos sintetizados

Los diagnósticos se derivan de los campos del archivo `run.json`:

| Condición | Diagnóstico |
|-----------|------------|
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

Se planea una emisión completa de diagnósticos estructurados para futuras fases.

---

## Selección de modelo (v0.3.1+)

La fase 3.1 agrega la selección explícita de modelos, al tiempo que conserva todas las garantías de la fase 2.

### Modelos soportados

| Modelo | Valor de la CLI | Descripción |
|-------|-----------|-------------|
| Regresión logística | `logistic_regression` | Predeterminado, rápido, interpretable |
| Bosque aleatorio | `random_forest` | Conjunto, maneja patrones no lineales |
| SVC lineal | `linear_svc` | Clasificador de vectores de soporte, basado en el margen |

### Configuración

Establezca la familia de modelos en la configuración de VS Code:

```json
{
  "runforge.modelFamily": "random_forest"
}
```

O use la interfaz de usuario de configuración: Busque "Familia de modelos de RunForge" y seleccione de la lista desplegable.

### Uso de la CLI

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

El argumento `--model` es opcional. Predeterminado: `logistic_regression`.

### Origen

La familia de modelos seleccionada se registra en el archivo `run.json`:

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Compatibilidad con versiones anteriores

- Todas las ejecuciones de la fase 2 siguen siendo legibles
- El comportamiento predeterminado no cambia (regresión logística)
- No se requiere migración
- El preprocesamiento permanece fijo (StandardScaler para todos los modelos)

---

## Hiperparámetros y perfiles de entrenamiento (v0.3.2+)

La fase 3.2 agrega el control explícito de hiperparámetros y perfiles de entrenamiento.

### Perfiles de entrenamiento

Los perfiles predefinidos proporcionan hiperparámetros preconfigurados:

| Perfil | Descripción | Familia de modelos |
|---------|-------------|--------------|
| `default` | Sin anulaciones de hiperparámetros | (utiliza la configuración) |
| `fast` | Menos iteraciones para ejecuciones rápidas | regresión_logística |
| `thorough` | Más árboles/iteraciones para mejor calidad | bosque_aleatorio |

Configure en la configuración de VS Code:
```json
{
  "runforge.profile": "fast"
}
```

### Hiperparámetros de la línea de comandos

Anule hiperparámetros individuales a través de la línea de comandos:

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Reglas de precedencia

Cuando tanto el perfil como los parámetros de la línea de comandos están definidos:

1. **`--param` de la línea de comandos** (mayor prioridad)
2. **Parámetros expandidos del perfil**
3. **Valores predeterminados del modelo** (menor prioridad)

### Origen

Los hiperparámetros y los perfiles se registran en `run.json`:

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

Cuando no se utiliza ningún perfil, los campos del perfil se omiten por completo (no se establecen como nulos).

---

## Métricas específicas del modelo (v0.3.3+)

La versión 3.3 agrega métricas detalladas y específicas del modelo, con selección de perfil basada en capacidades.

### Perfiles de métricas

Los perfiles de métricas se seleccionan automáticamente según las capacidades del modelo:

| Perfil | Descripción | Métricas |
|---------|-------------|---------|
| `classification.base.v1` | Todos los clasificadores | precisión, exactitud, exhaustividad, f1, matriz de confusión |
| `classification.proba.v1` | Binario + predict_proba | básico + ROC-AUC, pérdida logarítmica |
| `classification.multiclass.v1` | 3 o más clases | básico + precisión/exhaustividad/f1 por clase |

### Lógica de selección de perfil

- Clasificación binaria + `predict_proba` → `classification.proba.v1`
- Multiclase (3 o más clases) → `classification.multiclass.v1`
- De lo contrario → `classification.base.v1`

### Capacidades del modelo

| Modelo | predict_proba | decision_function |
|-------|---------------|-------------------|
| RegresiónLogística | ✅ | ✅ |
| BosqueAleatorio | ✅ | ❌ |
| LinearSVC | ❌ | ✅ (solo ROC-AUC) |

### Artefacto de métricas

Ahora, el entrenamiento produce `metrics.v1.json` junto con `metrics.json`:

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

### Metadatos de la ejecución

`run.json` ahora incluye un puntero a `metrics_v1`:

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

### Compatibilidad con versiones anteriores

- `metrics.json` (versión 2) permanece sin cambios
- Todas las herramientas existentes siguen funcionando
- Los campos del perfil en `run.json` aparecen juntos o no aparecen en absoluto.

---

## Importancia de las características (v0.3.4+)

La versión 3.4 agrega la extracción de la importancia de las características solo de lectura para los modelos compatibles.

### Modelos soportados

La importancia de las características solo está disponible para los modelos con señales de importancia nativas:

| Modelo | Compatible | Tipo de importancia |
|-------|-----------|-----------------|
| BosqueAleatorio | ✅ | Importancia de Gini |
| RegresiónLogística | ❌ | No disponible en v1 |
| LinearSVC | ❌ | No disponible en v1 |

**Sin aproximaciones**: Si el modelo no admite la importancia nativa, no se genera ningún artefacto.

### Artefacto de importancia de las características

Las ejecuciones de BosqueAleatorio producen `artifacts/feature_importance.v1.json`:

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

### Metadatos de la ejecución

`run.json` incluye una referencia a la importancia de las características cuando está disponible:

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

Cuando la importancia de las características no está disponible, estos campos se omiten por completo (no se establecen como nulos).

### Diagnósticos

Los modelos no compatibles emiten diagnósticos estructurados:

| Código | Descripción |
|------|-------------|
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | El modelo no admite la importancia nativa de las características |
| `FEATURE_NAMES_UNAVAILABLE` | No se pudieron resolver los nombres de las características |

### No compatible en v1

Los siguientes elementos están explícitamente fuera del alcance de la versión 1:

- Importancia basada en coeficientes para modelos lineales
- Explicaciones SHAP/LIME
- Importancia por permutación
- Gráficos de dependencia parcial

### Hiperparámetros compatibles

**Regresión logística:**
- `C` (float, > 0): Fuerza de regularización
- `max_iter` (int, > 0): Número máximo de iteraciones
- `solver` (str): Solucionador de optimización
- `warm_start` (bool): Reutilizar la solución anterior

**Bosque Aleatorio:**
- `n_estimators` (entero, > 0): Número de árboles.
- `max_depth` (entero o None): Profundidad máxima del árbol.
- `min_samples_split` (entero, >= 2): Número mínimo de muestras para dividir.
- `min_samples_leaf` (entero, > 0): Número mínimo de muestras por hoja.

**SVC Lineal:**
- `C` (flotante, > 0): Intensidad de regularización.
- `max_iter` (entero, > 0): Número máximo de iteraciones.

---

## Coeficientes Lineales (v0.3.5+)

La fase 3.5 agrega la extracción de coeficientes de solo lectura para clasificadores lineales.

### Modelos soportados

Los coeficientes lineales están disponibles para modelos con el atributo nativo `coef_`:

| Modelo | Compatible | Tipo de Coeficiente |
|-------|-----------|------------------|
| RegresiónLogística | ✅ | Coeficientes de log-odds |
| LinearSVC | ✅ | Coeficientes de SVM |
| BosqueAleatorio | ❌ | Utilice Importancia de Características en su lugar. |

**Sin aproximaciones**: Si el modelo no admite coeficientes nativos, no se genera ningún artefacto.

### Espacio de Coeficientes (IMPORTANTE)

**Todos los coeficientes están en el espacio de características ESTANDARIZADO.**

Esto significa:
- Los coeficientes corresponden a las características DESPUÉS de la aplicación de StandardScaler.
- Los valores representan la influencia por cada desviación estándar.
- No se intenta "invertir" la escala para volver a las unidades originales de las características.
- Comparar coeficientes entre diferentes características es significativo (misma escala).
- Comparar coeficientes con los valores originales de las características NO es significativo.

### Artefacto de Coeficientes Lineales

Las ejecuciones de modelos lineales producen `artifacts/linear_coefficients.v1.json`:

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

### Soporte para Clasificación Multiclase

Para la clasificación multiclase (3 o más clases), los coeficientes se agrupan por clase:

- Cada clase tiene su propio conjunto de coeficientes.
- Las etiquetas de clase se ordenan de forma determinista.
- No hay agregación entre clases en la versión 1.

### Metadatos de la ejecución

`run.json` incluye una referencia a los coeficientes lineales cuando están disponibles:

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

Cuando los coeficientes no están disponibles, estos campos se omiten por completo (no se establecen como nulos).

### Diagnósticos

Los modelos no compatibles emiten diagnósticos estructurados:

| Código | Descripción |
|------|-------------|
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | El modelo no admite la extracción de coeficientes. |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | El clasificador no tiene el atributo `coef_`. |
| `FEATURE_NAMES_UNAVAILABLE` | No se pudieron resolver los nombres de las características |

### Importancia de Características vs. Coeficientes Lineales

| Artefacto | Modelos soportados | Lo que Muestra |
|----------|------------------|---------------|
| Importancia de Características (v0.3.4) | BosqueAleatorio | Importancia de Gini (basada en árboles) |
| Coeficientes Lineales (v0.3.5) | LogisticRegression, LinearSVC | Coeficientes del modelo |

Estos son complementarios:
- Utilice la Importancia de Características para modelos de conjunto.
- Utilice los Coeficientes Lineales para modelos lineales interpretables.

### Guía de Interpretación

Para LogisticRegression (binaria):
- Coeficiente positivo: Aumento de la característica → Mayor probabilidad de la clase positiva.
- Coeficiente negativo: Aumento de la característica → Menor probabilidad de la clase positiva.
- Magnitud: Valor absoluto mayor = Mayor influencia.

Ejemplo: `coeficiente = 2.0` significa +1 desviación estándar en esta característica → +2.0 en los log-odds.

---

## Índice de Interpretación (v0.3.6+)

La fase 3.6 agrega un índice unificado que vincula todas las salidas de interpretación para una ejecución.

### Propósito

El índice de interpretación responde a la pregunta: "¿Qué salidas de interpretación existen para esta ejecución, qué versiones son y dónde están?"

No hay nuevos cálculos, solo se vinculan y resumen los artefactos existentes.

### Artefacto del Índice

Cada ejecución produce `artifacts/interpretability.index.v1.json`:

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

### Reglas de Disponibilidad

- Los artefactos ausentes se **omiten** de `available_artifacts` (no se establecen como nulos o falsos).
- El índice solo afirma la disponibilidad si el archivo realmente existe.
- Una ejecución mínima (LogisticRegression) tendrá `metrics_v1` y `linear_coefficients_v1`.
- Una ejecución de RandomForest tendrá `metrics_v1` y `feature_importance_v1`.

### Contenido del Resumen

Los resúmenes incluyen solo datos de referencia (sin valores numéricos duplicados):

| Artefacto | Contenido del resumen |
|----------|------------------|
| métricas_v1 | `metrics_profile`, `accuracy` (obtenidos de run.json) |
| feature_importance_v1 | `model_family`, `top_k` (solo nombres, máximo 5) |
| linear_coefficients_v1 | `model_family`, `num_classes`, `top_k_by_class` (solo nombres) |

### Comando de VS Code

Utilice `RunForge: Ver el índice de interpretabilidad más reciente` para ver un resumen formateado con enlaces rápidos para abrir los elementos individuales.

---

## Cómo empezar

Para obtener una guía paso a paso, consulte [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

---

## Contrato y documentación

### Documentos principales

| Documento | Propósito |
|----------|---------|
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | Cómo RunForge establece la confianza |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | Recorrido guiado de 2 a 3 minutos |
| [CONTRACT.md](CONTRACT.md) | Contrato de comportamiento completo |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | Reglas de expansión de la fase 3 |

### Fase 2 (Congelada)

| Documento | Alcance |
|----------|-------|
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | Observabilidad |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | Introspección |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | Mejoras de la experiencia de usuario |

### Fase 3 (Congelada a partir de la versión v0.3.6.0)

| Documento | Alcance |
|----------|-------|
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | Selección de modelos |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | Hiperparámetros y perfiles |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | Métricas específicas del modelo |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | Importancia de las características |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | Coeficientes lineales |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | Índice de interpretabilidad |

### Futuro

Consulte [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) para ver las mejoras planificadas.

---

## Estado de la fase

| Fase | Enfoque | Estado |
|-------|-------|--------|
| **Phase 2** | Entrenamiento principal, observabilidad | Congelada |
| **Phase 3** | Selección de modelos, interpretabilidad | **Frozen (v0.3.6.0)** |
| **Phase 4** | Ciclo de vida, recuperación, doctrina | **Lanzada (v1.1.0)** — consulte [`CONTRACT-PHASE-4.md`](CONTRACT-PHASE-4.md) |

**Todas las interfaces de contrato de las fases 2, 3 y 4 están bloqueadas. El trabajo futuro requiere un contrato de la fase 5.**

---

## Licencia

MIT

---

Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a
