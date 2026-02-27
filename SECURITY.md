# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

This extension operates **locally only** within VS Code.

- **Data touched:** workspace CSV files (read-only for training), `.runforge/` directory (run metadata, model artifacts, metrics JSON), Python subprocess stdout/stderr
- **Data NOT touched:** no files outside the open workspace, no browser data, no OS credentials, no other VS Code extensions' data
- **Permissions required:** filesystem read/write within workspace only, Python subprocess execution
- **No network egress** — all training, inspection, and artifact operations are local
- **No secrets handling** — does not read, store, or transmit credentials or API keys
- **No telemetry** is collected or sent
