import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'RunForge — VS Code Extension',
  description: 'Push-button ML training with deterministic, contract-driven behavior. Same dataset, same seed, same version — identical model, every time.',
  logoBadge: 'RF',
  brandName: 'RunForge',
  repoUrl: 'https://github.com/mcp-tool-shop-org/runforge-vscode',
  footerText: 'MIT Licensed — built by <a href="https://github.com/mcp-tool-shop-org" style="color:var(--color-muted);text-decoration:underline">mcp-tool-shop-org</a>',

  hero: {
    badge: 'VS Code Extension',
    headline: 'ML training with',
    headlineAccent: 'forensic certainty.',
    description: 'Push-button ML training with deterministic, contract-driven behavior. Same dataset, same seed, same version — identical model, every time. No surprises.',
    primaryCta: { href: 'https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.runforge', label: 'Install from Marketplace' },
    secondaryCta: { href: '#features', label: 'The guarantee' },
    previews: [
      { label: 'Install', code: 'ext install mcp-tool-shop.runforge' },
      { label: 'Set dataset', code: 'RUNFORGE_DATASET=data.csv\n# CSV must have a "label" column' },
      { label: 'Train', code: 'Ctrl+Shift+P → RunForge: Train (Standard)\n# → .runforge/runs/<id>/run.json' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'The RunForge Guarantee',
      subtitle: 'Opinionated software designed to replace "it works on my machine" with reproducible, traceable results.',
      features: [
        {
          title: 'Deterministic by Design',
          desc: 'Every run is seeded. Re-run the same preset with the same seed on the same data — you get the exact same model. No randomness outside explicitly seeded behavior.',
        },
        {
          title: '3 Models + Profiles',
          desc: 'Logistic Regression, Random Forest, Linear SVC. Combine with fast, thorough, or default training profiles. Hyperparameters are explicit, recorded, and never guessed.',
        },
        {
          title: 'Full Interpretability',
          desc: 'Feature importance (RandomForest), linear coefficients (Logistic/SVC), model-aware metrics, and a unified interpretability index — all saved as versioned JSON artifacts.',
        },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Getting Started',
      cards: [
        {
          title: '1. Point at your dataset',
          code: '# CSV with a "label" column\nRUNFORGE_DATASET=/path/to/data.csv\n\n# Or set in VS Code settings:\n"runforge.datasetPath": "/path/to/data.csv"',
        },
        {
          title: '2. Choose a model',
          code: '// .vscode/settings.json\n{\n  "runforge.modelFamily": "random_forest",\n  "runforge.profile": "thorough"\n}',
        },
        {
          title: '3. Train',
          code: 'Ctrl+Shift+P → RunForge: Train (Standard)\n\n# Artifacts land in:\n.runforge/runs/<run-id>/\n  ├── run.json\n  ├── metrics.v1.json\n  └── artifacts/model.pkl',
        },
        {
          title: '4. Inspect results',
          code: 'Ctrl+Shift+P → RunForge: Browse Runs\n# Select run → Open Run Summary\n\n# Or view interpretability:\n→ View Latest Feature Importance\n→ View Latest Interpretability Index',
        },
      ],
    },
    {
      kind: 'data-table',
      id: 'commands',
      title: 'Commands',
      subtitle: 'All commands available via the Command Palette (Ctrl+Shift+P / Cmd+Shift+P).',
      columns: ['Command', 'Description'],
      rows: [
        ['RunForge: Train (Standard)', 'Train with the std-train preset'],
        ['RunForge: Train (High Quality)', 'Train with the hq-train preset'],
        ['RunForge: Browse Runs', 'Browse all runs with summary, diagnostics, and artifact actions'],
        ['RunForge: Inspect Dataset', 'Validate dataset columns and label before training'],
        ['RunForge: View Latest Metrics', 'View detailed model-aware metrics (v0.3.3+)'],
        ['RunForge: View Latest Feature Importance', 'View Gini importance for RandomForest models'],
        ['RunForge: View Latest Linear Coefficients', 'View standardized coefficients for Logistic/SVC'],
        ['RunForge: View Latest Interpretability Index', 'Unified index of all interpretability artifacts'],
        ['RunForge: Export Latest Run as Markdown', 'Save a formatted run summary as .md'],
      ],
    },
    {
      kind: 'api',
      id: 'settings',
      title: 'Settings',
      subtitle: 'Configure via VS Code settings (runforge.*).',
      apis: [
        {
          signature: 'runforge.modelFamily: "logistic_regression" | "random_forest" | "linear_svc"',
          description: 'Classifier to use for training. Default: "logistic_regression".',
        },
        {
          signature: 'runforge.profile: "default" | "fast" | "thorough"',
          description: '"fast" reduces iterations for quick runs. "thorough" adds trees/iterations for better quality. Default: "default".',
        },
        {
          signature: 'runforge.pythonPath: string',
          description: 'Path to the Python executable. Auto-detected from PATH if empty.',
        },
        {
          signature: 'runforge.mlRunnerModule: string',
          description: 'Python module path for the ML runner. Defaults to the bundled ml_runner.',
        },
      ],
    },
  ],
};
