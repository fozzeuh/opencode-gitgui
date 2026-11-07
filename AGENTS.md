# AGENTS.md

Instructions for AI agents working in this repository.

## Changelog is mandatory

Every commit must include a documentation update in the same commit. A commit
that changes code, behavior, configuration, tests, or documentation structure
without a changelog entry is incomplete.

Before committing:

1. Add an entry to [`docs/changelog.md`](./docs/changelog.md):
   - place it under the current phase or date;
   - explain what changed and why, not just which files were touched;
   - call out user-visible behavior, API, security, and limit changes;
   - update the "Current status" table when a feature moves forward.
2. Update [`README.md`](./README.md) when installation, usage, APIs, limits, or
   project structure change.
3. Leave [`docs/initial-request.md`](./docs/initial-request.md) untouched; it is
   a verbatim historical record of the original brief.
4. Write documentation and commit messages in English.
5. Run `npm run check` before committing. If a check cannot pass, say so
   explicitly instead of hiding it.

Do not invent commit hashes. If a changelog entry needs a hash, add it in a
later commit once the hash exists.

## Git

- Commits are allowed without asking.
- Never push without explicit approval for that specific push.
