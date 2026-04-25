# Release Provenance

## Tag drift — v1.0.0 / v1.0.1

The marketplace listings for RunForge VS Code at versions **v1.0.0** and **v1.0.1** were published before this git repository was created. As a result, there are **no `v1.0.0` or `v1.0.1` git tags** in the canonical repo.

- `runforge-1.0.0.vsix` and `runforge-1.0.1.vsix` exist as marketplace artifacts only.
- The first git-tagged release will be cut at the next published version (e.g. `v1.0.2` or `v1.1.0`), tagged on the swarm-final commit.
- All future releases follow the canonical `tag → build → publish` order from this repo.

## Why this is recorded

So that any future audit comparing `git tag --list` against the marketplace history finds an explicit explanation for the missing pre-repo tags rather than a silent gap.

## Rule going forward

Every published version after this point MUST have a matching annotated git tag at the commit that produced its VSIX.
