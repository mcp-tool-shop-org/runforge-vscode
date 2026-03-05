---
title: RunForge Handbook
description: The complete guide to push-button ML training in VS Code.
sidebar:
  order: 0
---

Welcome to the RunForge Handbook — your guide to deterministic, contract-driven ML training directly in VS Code.

## What is RunForge?

RunForge is a VS Code extension for push-button machine learning training. It provides deterministic, seeded runs with full provenance — every model can be traced back to the exact code, data, and configuration that produced it. No cloud dependencies, no hidden databases, no magic.

## The RunForge guarantee

1. **Determinism** — every run is seeded. Same preset + same seed + same data = same model
2. **Provenance** — every `run.json` includes Git commit SHA, Python path, and extension version
3. **Auditability** — artifacts are standard formats (JSON, joblib) saved to disk

## Handbook sections

- **[Getting Started](/runforge-vscode/handbook/getting-started/)** — Install, configure, and run your first training session
- **[Reference](/runforge-vscode/handbook/reference/)** — Presets, run lifecycle, artifacts, interpretability, and settings

## Quick links

- [GitHub Repository](https://github.com/mcp-tool-shop-org/runforge-vscode)
- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=mcp-tool-shop.runforge)
- [Trust Model](https://github.com/mcp-tool-shop-org/runforge-vscode/blob/main/docs/TRUST_MODEL.md)
