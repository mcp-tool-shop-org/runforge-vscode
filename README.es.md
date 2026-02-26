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

Entrenamiento de modelos de aprendizaje automático con un solo clic, que ofrece un comportamiento determinista y basado en contratos.

La fase 3 (capacidades e interpretabilidad) se ha completado con la versión 0.3.6.0.
Los trabajos futuros se llevarán a cabo en el marco de los contratos de la fase 4.

---

## 🛡️ La garantía de RunForge

RunForge es un software diseñado para eliminar la frase "funciona en mi máquina" y reemplazarla con una certeza basada en análisis forenses.

### Lo que garantizamos
1.  **Determinismo:** Cada ejecución se inicia con una semilla específica. Ejecutar la misma configuración con la misma semilla y los mismos datos produce exactamente el mismo modelo.
2.  **Trazabilidad:** Cada registro en el archivo `run.json` incluye el identificador SHA del commit de Git, la ruta del intérprete de Python y la versión de la extensión utilizada. Se puede rastrear cualquier modelo hasta el código que lo generó.
3.  **Auditoría:** Los artefactos (modelos, métricas, registros) se guardan en el disco en formatos estándar (JSON, joblib). No hay bases de datos ocultas, ni dependencias de la nube.

### Lo que esto no es
-   **No es una herramienta de AutoML mágica**: No adivinamos lo que necesita. Ejecutamos configuraciones específicas y personalizables.
-   **No es una plataforma en la nube**: No enviamos sus datos a ningún lugar. Todo se ejecuta localmente en su espacio de trabajo de VS Code.

Para obtener información completa sobre el modelo de confianza, consulte el documento [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md).

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

## Instalación

```bash
npm install
npm run compile
```

## Comandos

| Comando. | Descripción. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| `RunForge: Train (Standard)` | Ejecutar el entrenamiento utilizando la configuración predefinida "std-train". |
| `RunForge: Train (High Quality)` | Ejecutar el entrenamiento utilizando la configuración predefinida "hq-train". |
| `RunForge: Open Runs` | Ver las sesiones de entrenamiento completadas. |
| `RunForge: Inspect Dataset` | Validar el conjunto de datos antes del entrenamiento (versión 0.2.2.1 o superior). |
| `RunForge: Open Latest Run Metadata` | Ver los metadatos de la última ejecución (versión v0.2.2.1 o superior). |
| `RunForge: Inspect Model Artifact` | Ver la estructura de la tubería (pipeline) del modelo "model.pkl" (versión 0.2.2.2 o superior). |
| `RunForge: Browse Runs` | Ver todas las ejecuciones con acciones (resumen, diagnósticos, artefactos) (versión 0.2.3 o superior). |
| `RunForge: View Latest Metrics` | Consulte las métricas detalladas en el archivo metrics.v1.json (versión 0.3.3 o superior). |
| `RunForge: View Latest Feature Importance` | Visualice la importancia de las características para los modelos de Random Forest (versión 0.3.4 y posteriores). |
| `RunForge: View Latest Linear Coefficients` | Ver los coeficientes de los modelos lineales (versión 0.3.5 y posteriores). |
| `RunForge: View Latest Interpretability Index` | Ver el índice unificado de todos los elementos relacionados con la interpretabilidad (versión 0.3.6 o superior). |
| `RunForge: Export Latest Run as Markdown` | Guardar un resumen formateado en Markdown de la última ejecución (versión 0.4.3 o superior). |

## Uso

1. Establezca la variable de entorno `RUNFORGE_DATASET` con la ruta a su archivo CSV.
2. El archivo CSV debe tener una columna llamada `label`.
3. Inicie el entrenamiento a través del panel de comandos.

---

## Garantías (versión 0.2.1 o superior)

RunForge para VS Code ofrece un entrenamiento de modelos de aprendizaje automático determinista y basado en contratos. Las garantías que se indican a continuación son intencionales y se verifican mediante pruebas.

### Determinismo

Dado el mismo conjunto de datos, configuración y versión de RunForge:

- Las divisiones de entrenamiento y validación son idénticas en todas las ejecuciones.
- Los resultados generados son reproducibles.
- Los resultados de las métricas son estables.

No existe aleatoriedad fuera de los comportamientos que se definen explícitamente.

### Manejo de etiquetas

- La columna que contiene las etiquetas se especifica explícitamente.
- La etiqueta nunca se deduce de la posición de la columna.
- Las etiquetas mal configuradas o faltantes generan errores de forma temprana.

### Contrato de indicadores

El entrenamiento produce exactamente tres métricas:

```json
{
  "accuracy": number,
  "num_samples": number,
  "num_features": number
}
```

No se añaden campos adicionales de forma implícita.
La ampliación del esquema requiere un cambio en el contrato que se gestione mediante versiones.

### Artefactos del modelo

- `model.pkl` siempre es una instancia serializada de `sklearn.Pipeline`.
- Todo el preprocesamiento (por ejemplo, la normalización) está integrado.
- El archivo es autónomo y está listo para su uso en inferencia.

No se requieren pasos de preprocesamiento externos.

### Datos faltantes

- Las filas que contienen valores faltantes se eliminan de forma determinista.
- Se registra el número de filas eliminadas.
- No se realiza ninguna imputación implícita.

### Fuente de información confiable

- Toda la lógica de ejecución de Python se encuentra en el directorio `python/ml_runner/`.
- No existen implementaciones duplicadas ni alternativas.
- Las pruebas garantizan la coherencia entre el comportamiento de TypeScript y Python.

### Política de estabilidad

- El comportamiento en la versión v0.2.1 está fijado y no se modificarán sus características.
- Los cambios que rompen la compatibilidad requieren un aumento explícito de la versión principal.
- Los cambios en el comportamiento que no se anuncian se consideran errores.

---

## Goles anulados (intencionales)

Actualmente, RunForge no intenta:

- Selección automática de modelos (el usuario debe elegir explícitamente).
- Ajuste de hiperparámetros (los valores predeterminados son fijos para cada configuración).
- Realización de entrenamiento en línea o incremental.
- Ocultamiento del comportamiento del entrenamiento mediante heurísticas.

La precisión y la transparencia son prioritarias sobre la automatización.

---

---

## Observabilidad (versión 0.2.2.1 o superior)

La fase 2.2.1 proporciona mayor información sobre las ejecuciones de entrenamiento sin modificar el comportamiento del entrenamiento.

### Ejecutar metadatos

Cada ejecución de entrenamiento genera un archivo `run.json` que contiene:

- Identificador de la ejecución y marca de tiempo.
- Huella digital del conjunto de datos (SHA-256).
- Columna de etiquetas y número de características.
- Número de filas eliminadas.
- Resumen de las métricas.
- Rutas de los archivos generados.

### Inspección del conjunto de datos

Inspeccione los conjuntos de datos antes de comenzar el entrenamiento:

```bash
python -m ml_runner inspect --dataset data.csv --label label
```

Devuelve los nombres de las columnas, el número de filas, el número de características y la validación de las etiquetas.

### Seguimiento del origen

Todas las ejecuciones están indexadas en el archivo `.runforge/index.json` para facilitar el seguimiento:

- A partir de un archivo `model.pkl`, rastrear hasta los metadatos de la ejecución.
- Encontrar todas las ejecuciones correspondientes a una huella digital específica del conjunto de datos.
- Índice de solo escritura (nunca se reordena ni se eliminan elementos).

---

## Introspección de artefactos (versión 0.2.2.2 o superior)

La fase 2.2.2 introduce la posibilidad de inspeccionar los elementos generados durante el entrenamiento, pero de forma de solo lectura.

La función de inspección es de solo lectura y no permite volver a entrenar ni modificar los elementos.

### Inspección de tuberías

Inspeccione el contenido de un archivo `model.pkl` sin necesidad de volver a entrenar el modelo:

```bash
python -m ml_runner inspect-artifact --artifact model.pkl
```

Devuelve una estructura JSON que contiene:

- Pasos del proceso (en orden).
- Tipos de pasos y módulos.
- Detección de preprocesamiento.

Okay, I understand. Please provide the English text you would like me to translate.

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

### Diagnóstico

Los diagnósticos estructurados explican por qué una ejecución se comportó de la manera en que lo hizo:

| Code | Descripción. |
| Por favor, proporciona el texto que deseas que traduzca. | Por favor, proporciona el texto que deseas que traduzca. |
| `MISSING_VALUES_DROPPED` | Filas eliminadas debido a valores faltantes. |
| `LABEL_NOT_FOUND` | La columna "etiqueta" no está presente en el conjunto de datos. |
| `LABEL_TYPE_INVALID` | La columna "Etiqueta" tiene un tipo de dato inválido. |
| `ZERO_ROWS` | El conjunto de datos tiene cero filas después del procesamiento. |
| `ZERO_FEATURES` | El conjunto de datos no tiene columnas de características. |
| `LABEL_ONLY_DATASET` | El conjunto de datos contiene únicamente la columna de etiquetas. |

Todos los diagnósticos están en formato JSON, que es legible por máquina (no es necesario realizar ningún análisis de registros).

---

## Explorar rutas (versión 0.2.3 o superior)

La fase 2.3 introduce un navegador de ejecuciones unificado con acciones rápidas.

### Utilizando las ejecuciones de exploración

1. Abra el panel de comandos (`Ctrl+Shift+P`).
2. Ejecute `RunForge: Explorar ejecuciones`.
3. Seleccione una ejecución de la lista (mostrando primero las más recientes).
4. Elija una acción:
- **Abrir resumen de la ejecución** — Ver los metadatos de la ejecución en formato Markdown legible.
- **Ver diagnósticos** — Consultar los eventos que ocurrieron durante la ejecución.
- **Inspeccionar el artefacto del modelo** — Ver la estructura de la canalización.
- **Copiar la huella digital del conjunto de datos** — Copiar el valor SHA-256 al portapapeles.

### Diagnósticos integrados

Los diagnósticos se obtienen a partir de los campos del archivo "run.json":

| Condición. | Diagnóstico. |
| Por favor, proporciona el texto que deseas que traduzca. | Por favor, proporciona el texto que deseas que traduzca. |
| `dropped_rows_missing_values > 0` | `MISSING_VALUES_DROPPED` |

Se prevé que en futuras fases se implementen diagnósticos de emisiones más completos y estructurados.

---

## Selección de modelo (versión 0.3.1 o superior)

La fase 3.1 introduce la selección explícita del modelo, manteniendo al mismo tiempo todas las garantías de la fase 2.

### Modelos compatibles

| Model | Valor de la interfaz de línea de comandos (CLI). | Descripción. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Por favor, proporciona el texto que deseas que traduzca. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| Regresión logística. | `logistic_regression` | Predeterminado, rápido, interpretable. |
| Bosque aleatorio. | `random_forest` | Ensemble permite analizar patrones no lineales. |
| SVC lineal. | `linear_svc` | Clasificador de vectores de soporte, basado en el margen. |

### Configuración

Configure la familia de modelos en la configuración de VS Code:

```json
{
  "runforge.modelFamily": "random_forest"
}
```

O bien, utilice la interfaz de configuración: busque "Familia de modelos RunForge" y seleccione la opción deseada en el menú desplegable.

### Uso de la línea de comandos

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --model random_forest
```

El argumento `--model` es opcional. El valor predeterminado es: `logistic_regression`.

### Origen

El modelo específico utilizado se registra en el archivo `run.json`:

```json
{
  "model_family": "random_forest",
  "runforge_version": "0.3.1.0"
}
```

### Compatibilidad con versiones anteriores

- Todas las ejecuciones de la Fase 2 siguen siendo legibles.
- El comportamiento predeterminado no ha cambiado (regresión logística).
- No se requiere ninguna migración.
- El preprocesamiento se mantiene sin cambios (StandardScaler para todos los modelos).

---

## Hiperparámetros y perfiles de entrenamiento (versión 0.3.2 o superior)

La fase 3.2 introduce un control explícito de los hiperparámetros y perfiles de entrenamiento.

### Perfiles de formación

Los perfiles predefinidos ofrecen hiperparámetros configurados previamente.

| Perfil. | Descripción. | Modelo de familia. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | "The company is committed to providing high-quality products and services."

"We are looking for a motivated and experienced candidate."

"The meeting will be held on Tuesday at 10:00 AM."

"Please submit your application by the end of the week."

"We offer a competitive salary and benefits package."
-------------

"La empresa está comprometida a ofrecer productos y servicios de alta calidad."

"Estamos buscando un candidato motivado y con experiencia."

"La reunión se llevará a cabo el martes a las 10:00 AM."

"Por favor, envíe su solicitud antes de que finalice la semana."

"Ofrecemos un salario competitivo y un paquete de beneficios." | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| `default` | No existen opciones para anular los hiperparámetros. | (utiliza la configuración) |
| `fast` | Menos iteraciones para ejecuciones rápidas. | regresión logística |
| `thorough` | Más árboles/iteraciones para una mejor calidad. | bosque aleatorio |

Configure en la configuración de VS Code:
```json
{
  "runforge.profile": "fast"
}
```

### Hiperparámetros de la interfaz de línea de comandos

Se pueden modificar los hiperparámetros individuales a través de la línea de comandos.

```bash
python -m ml_runner train --preset std-train --out ./run --device cpu --param C=0.5 --param max_iter=200
```

### Reglas de precedencia

Cuando tanto los parámetros del perfil como los parámetros de la línea de comandos están configurados:

1. **Parámetros especificados en la línea de comandos (`--param`)** (mayor prioridad)
2. **Parámetros expandidos a partir del perfil**
3. **Valores predeterminados del modelo** (menor prioridad)

### Origen

Los hiperparámetros y los perfiles se registran en el archivo `run.json`:

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

Cuando no se utiliza un perfil, los campos del perfil se omiten por completo (no se establecen como valores nulos).

---

## Métricas específicas para cada modelo (versión 0.3.3 y posteriores)

La fase 3.3 introduce métricas detalladas y específicas para cada modelo, con la posibilidad de seleccionar perfiles basados en las capacidades.

### Perfiles de métricas

Los perfiles de métricas se seleccionan automáticamente en función de las capacidades del modelo:

| Perfil. | Descripción. | Métricas. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| `classification.base.v1` | Todos los clasificadores. | precisión, exactitud, exhaustividad, métrica F1, matriz de confusión. |
| `classification.proba.v1` | Binario + predecir probabilidad. | base + ROC-AUC, pérdida logarítmica. |
| `classification.multiclass.v1` | 3 clases o más. | base + precisión/exhaustividad/f1 por clase. |

### Lógica de selección de perfiles

- Clasificación binaria + `predict_proba` → `classification.proba.v1`
- Clasificación multiclase (3 o más clases) → `classification.multiclass.v1`
- En cualquier otro caso → `classification.base.v1`

### Capacidades del modelo

| Model | predict_proba | función de decisión. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | "The company is committed to providing high-quality products and services."

"We are looking for a motivated and experienced professional to join our team."

"Please contact us if you have any questions."

"Thank you for your interest."
---------------

"La empresa está comprometida a ofrecer productos y servicios de alta calidad."

"Estamos buscando a un profesional motivado y con experiencia para que se una a nuestro equipo."

"Por favor, contáctenos si tiene alguna pregunta."

"Gracias por su interés." | Sure, here is the Spanish translation of the English text:

"Please provide the English text you would like me to translate." |
| RegresiónLogística | ✅ | ✅ |
| Bosque Aleatorio. | ✅ | ❌ |
| LinearSVC | ❌ | ✅ (Solo para la métrica ROC-AUC) |

### Artefacto de métricas

Actualmente, el proceso de entrenamiento genera tanto el archivo `metrics.v1.json` como el archivo `metrics.json`.

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

### Ejecutar metadatos

El archivo `run.json` ahora incluye un puntero a `metrics_v1`:

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

### Compatibilidad con versiones anteriores

- El archivo `metrics.json` (Fase 2) permanece sin cambios.
- Todas las herramientas existentes siguen funcionando.
- Los campos del perfil en `run.json` se muestran juntos o no se muestran en absoluto.

---

## Importancia de las características (versión 0.3.4 y posteriores)

La fase 3.4 introduce una función de extracción de la importancia de las características en modo de solo lectura, compatible con determinados modelos.

### Modelos compatibles

La importancia de las características solo está disponible para los modelos que tienen señales de importancia integradas.

| Model | Soportado. | Tipo de importancia. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Por favor, proporciona el texto que deseas que traduzca. | "The company is committed to providing high-quality products and services."

"We are looking for a motivated and experienced professional to join our team."

"The deadline for submitting applications is October 31st."

"Please contact us if you have any questions."
-----------------
"La empresa está comprometida a ofrecer productos y servicios de alta calidad."

"Estamos buscando a un profesional motivado y con experiencia para que se una a nuestro equipo."

"La fecha límite para presentar las solicitudes es el 31 de octubre."

"Por favor, contáctenos si tiene alguna pregunta." |
| Bosque Aleatorio. | ✅ | Importancia del coeficiente de Gini. |
| RegresiónLogística | ❌ | No disponible en la versión 1. |
| LinearSVC | ❌ | No disponible en la versión 1. |

**Sin aproximaciones:** Si el modelo no admite la importancia nativa, no se genera ningún resultado.

### Importancia de las características. Artifacto

Las ejecuciones de RandomForest generan el archivo `artifacts/feature_importance.v1.json`:

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

### Ejecutar metadatos

El archivo `run.json` incluye información sobre la importancia de las características, cuando está disponible.

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

Cuando la importancia de las características no está disponible, estos campos se omiten por completo (no se incluyen valores nulos).

### Diagnósticos

Los modelos no soportados emiten diagnósticos estructurados:

| Code | Descripción. |
|------|-------------|
| `FEATURE_IMPORTANCE_UNSUPPORTED_MODEL` | El modelo no admite la función nativa de cálculo de la importancia de las variables. |
| `FEATURE_NAMES_UNAVAILABLE` | No se pudieron resolver los nombres de las características. |

### No compatible en la versión 1

A continuación, se enumeran explícitamente los elementos que no están incluidos en el alcance de la versión 1:

- Importancia basada en coeficientes para modelos lineales.
- Explicaciones mediante SHAP/LIME.
- Importancia basada en permutaciones.
- Gráficos de dependencia parcial.

### Hiperparámetros soportados

**Regresión Logística:**
- `C` (flotante, > 0): Intensidad de la regularización.
- `max_iter` (entero, > 0): Número máximo de iteraciones.
- `solver` (cadena de texto): Algoritmo de optimización.
- `warm_start` (booleano): Reutilizar la solución anterior.

**Bosque Aleatorio:**
- `n_estimators` (entero, > 0): Número de árboles.
- `max_depth` (entero o None): Profundidad máxima de los árboles.
- `min_samples_split` (entero, >= 2): Número mínimo de muestras para dividir un nodo.
- `min_samples_leaf` (entero, > 0): Número mínimo de muestras por hoja.

**SVC Lineal:**
- `C` (flotante, > 0): Intensidad de la regularización.
- `max_iter` (entero, > 0): Número máximo de iteraciones.

---

## Coeficientes lineales (versión 0.3.5 y posteriores)

La fase 3.5 introduce la extracción de coeficientes de solo lectura para clasificadores lineales.

### Modelos compatibles

Los coeficientes lineales están disponibles para los modelos que tienen un atributo nativo llamado `coef_`:

| Model | Soportado. | Tipo de coeficiente. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Por favor, proporcione el texto que desea que traduzca. | Sure, here is the Spanish translation of the English text:

"Please provide the English text you would like me to translate." |
| RegresiónLogística | ✅ | Coeficientes de log-odds. |
| LinearSVC | ✅ | Coeficientes de la Máquina de Vectores de Soporte (SVM). |
| Bosque Aleatorio. | ❌ | Utilice la función de importancia de las características en su lugar. |

**Sin aproximaciones:** Si el modelo no admite coeficientes nativos, no se genera ningún artefacto.

### Espacio de coeficientes (IMPORTANTE)

Todos los coeficientes están expresados en un espacio de características normalizado.

Esto significa:
- Los coeficientes corresponden a las características DESPUÉS de la aplicación de StandardScaler.
- Los valores representan la influencia por cada aumento de una desviación estándar.
- No se intenta "invertir" la escala para volver a las unidades originales de las características.
- La comparación de coeficientes entre diferentes características es significativa (misma escala).
- La comparación de coeficientes con los valores originales de las características NO es significativa.

### Artefacto debido a los coeficientes lineales

Las ejecuciones del modelo lineal generan el archivo `artifacts/linear_coefficients.v1.json`:

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

### Soporte para múltiples clases

Para la clasificación multiclase (con 3 o más clases), los coeficientes se agrupan por clase:

- Cada clase tiene su propio conjunto de coeficientes.
- Las etiquetas de las clases se ordenan de forma determinista.
- No se realiza ninguna agregación entre clases en la versión 1.

### Ejecutar metadatos

El archivo `run.json` incluye los coeficientes lineales de referencia, cuando están disponibles.

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

Cuando los coeficientes no están disponibles, estos campos se omiten por completo (no se dejan en blanco).

### Diagnóstico

Los modelos no soportados emiten diagnósticos estructurados:

| Code | Descripción. |
| Translate the following English text into Spanish:

"The company is committed to providing high-quality products and services. We strive to meet and exceed customer expectations. Our team is dedicated to innovation and continuous improvement. We value integrity, transparency, and respect in all our interactions."
"La empresa está comprometida a ofrecer productos y servicios de alta calidad. Nos esforzamos por satisfacer y superar las expectativas de nuestros clientes. Nuestro equipo está dedicado a la innovación y la mejora continua. Valoramos la integridad, la transparencia y el respeto en todas nuestras interacciones." | Por favor, proporciona el texto que deseas que traduzca. |
| `LINEAR_COEFFICIENTS_UNSUPPORTED_MODEL` | El modelo no admite la extracción de coeficientes. |
| `COEFFICIENTS_MISSING_ON_ARTIFACT` | El clasificador no tiene el atributo "coef_". |
| `FEATURE_NAMES_UNAVAILABLE` | No se pudieron resolver los nombres de las características. |

### Importancia de las características frente a los coeficientes lineales

| Objeto antiguo. | Modelos compatibles. | Lo que muestra. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Sure, here is the Spanish translation of the English text:

"Please provide the English text you would like me to translate." | "Please provide the text you would like me to translate." |
| Importancia de las características (versión 0.3.4) | Bosque Aleatorio. | Importancia de la medida Gini (basada en árboles). |
| Coeficientes lineales (versión 0.3.5). | LogisticRegression, LinearSVC. | Coeficientes del modelo. |

Estas son opciones complementarias:
- Utilice la importancia de las características para modelos de conjunto.
- Utilice los coeficientes lineales para modelos lineales interpretables.

### Guía de interpretación

Para la regresión logística (binaria):
- Coeficiente positivo: Un aumento en la característica implica una mayor probabilidad de pertenecer a la clase positiva.
- Coeficiente negativo: Un aumento en la característica implica una menor probabilidad de pertenecer a la clase positiva.
- Magnitud: Un valor absoluto mayor indica una mayor influencia.

Ejemplo: `coeficiente = 2.0` significa +1 desviación estándar en esta característica → +2.0 en la escala de logaritmo de probabilidades.

---

## Índice de interpretabilidad (versión 0.3.6 y posteriores)

La fase 3.6 introduce un índice unificado que relaciona todos los resultados de interpretabilidad para una ejecución específica.

### Propósito

El índice de interpretabilidad responde a las siguientes preguntas: "¿Qué resultados de interpretabilidad se han generado en esta ejecución, qué versiones tienen y dónde se encuentran?"

No se realiza ningún cálculo nuevo; simplemente se vinculan y se resumen elementos ya existentes.

### Índice de artefactos

Cada ejecución genera el archivo `artifacts/interpretability.index.v1.json`:

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

### Reglas de disponibilidad

- Los artefactos que no están disponibles se **omiten** de la lista `available_artifacts` (no se establecen como nulos o falsos).
- El índice solo indica la disponibilidad si el archivo realmente existe.
- Una ejecución básica (LogisticRegression) tendrá los campos `metrics_v1` y `linear_coefficients_v1`.
- Una ejecución de RandomForest tendrá los campos `metrics_v1` y `feature_importance_v1`.

### Resumen del contenido

Los resúmenes incluyen únicamente datos de referencia (sin valores numéricos repetidos).

| Objeto antiguo. | Resumen. Contiene. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Sure, here is the Spanish translation of the English text:

"Please provide the English text you would like me to translate." |
| métricas_v1 | `metrics_profile`, `accuracy` (extraídos de run.json) |
| importancia_de_las_características_v1 | `model_family`, `top_k` (solo los nombres, máximo 5). |
| coeficientes_lineales_v1 | `model_family`, `num_classes`, `top_k_by_class` (solo los nombres) |

### Comando de VS Code

Utilice la opción "RunForge: Ver el índice de interpretabilidad más reciente" para ver un resumen con formato y enlaces directos para abrir cada elemento individualmente.

---

## Comenzando

Para una guía paso a paso, consulte [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

---

## Contratos y documentación

### Documentos esenciales

| Documento. | Propósito. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| [docs/TRUST_MODEL.md](docs/TRUST_MODEL.md) | Cómo RunForge genera confianza. |
| [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md) | Visita guiada de 2 a 3 minutos. |
| [CONTRACT.md](CONTRACT.md) | Contrato de conducta completo. |
| [CONTRACT-PHASE-3.md](CONTRACT-PHASE-3.md) | Reglas de expansión para la fase 3. |

### Fase 2 (Congelada)

| Documento. | Scope |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| [docs/PHASE-2.2.1-ACCEPTANCE.md](docs/PHASE-2.2.1-ACCEPTANCE.md) | Observabilidad. |
| [docs/PHASE-2.2.2-ACCEPTANCE.md](docs/PHASE-2.2.2-ACCEPTANCE.md) | Introspección. |
| [docs/PHASE-2.3-ACCEPTANCE.md](docs/PHASE-2.3-ACCEPTANCE.md) | Optimización de la experiencia de usuario. |

### Fase 3 (congelada a partir de la versión 0.3.6.0)

| Documento. | Scope |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. |
| [docs/PHASE-3.1-ACCEPTANCE.md](docs/PHASE-3.1-ACCEPTANCE.md) | Selección de modelos. |
| [docs/PHASE-3.2-ACCEPTANCE.md](docs/PHASE-3.2-ACCEPTANCE.md) | Hiperparámetros y perfiles. |
| [docs/PHASE-3.3-ACCEPTANCE.md](docs/PHASE-3.3-ACCEPTANCE.md) | Métricas específicas para cada modelo. |
| [docs/PHASE-3.4-ACCEPTANCE.md](docs/PHASE-3.4-ACCEPTANCE.md) | Importancia de las características. |
| [docs/PHASE-3.5-ACCEPTANCE.md](docs/PHASE-3.5-ACCEPTANCE.md) | Coeficientes lineales. |
| [docs/PHASE-3.6-ACCEPTANCE.md](docs/PHASE-3.6-ACCEPTANCE.md) | Índice de interpretabilidad. |

### Futuro

Consulte el documento [docs/DEFERRED_UX_ENHANCEMENTS.md](docs/DEFERRED_UX_ENHANCEMENTS.md) para conocer las mejoras planificadas.

---

## Estado de la fase

| Phase | Focus | Estado. |
| Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | Please provide the English text you would like me to translate. I am ready to translate it into Spanish. | "The company is committed to providing high-quality products and services."

"La empresa está comprometida a ofrecer productos y servicios de alta calidad." |
| **Phase 2** | Formación fundamental, capacidad de monitorización. | Congelado. |
| **Phase 3** | Selección de modelos, interpretabilidad. | **Frozen (v0.3.6.0)** |
| **Phase 4** | TBD | Requiere un nuevo contrato. |

Todas las garantías correspondientes a las fases 2 y 3 están fijadas. Para futuros trabajos, se requieren contratos de la fase 4.

---

## Licencia

MIT.
