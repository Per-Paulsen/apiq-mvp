# apiq-mvp

API Intelligence platform — LLM-mediated comprehension, scoring, and improvement of OpenAPI specs.

Sibling project to ExpliqAI. Same stack, same workflow philosophy, different domain (OpenAPI specs instead of n8n workflows).

## Status

Phase A: repo skeleton with skills and tech stack. PRD pending.

## Workflow

See [`CLAUDE.md`](CLAUDE.md) for architecture conventions and the spec-driven development workflow.

## Key files

- [`CLAUDE.md`](CLAUDE.md) — guidance for Claude Code
- [`tech-stack.md`](tech-stack.md) — tech stack
- [`prd.md`](prd.md) — product requirements (pending)
- [`.claude/skills/`](.claude/skills/) — custom skills for the spec-driven workflow
- [`specs/`](specs/) — epic specifications (generated from PRD via `/spec`)
- [`openapi-examples/`](openapi-examples/) — sample OpenAPI specs for development
