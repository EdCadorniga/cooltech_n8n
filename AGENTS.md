# Agent Instructions

## n8n Instance

We use **katwill** as our n8n instance: `https://automation.katwillservices.com.au/home/workflows`.

Two tool prefixes are available:

| Tool prefix | What it does |
|---|---|
| `n8n_katwill_*` | Basic CRUD (list, create, update, delete workflows; activate/deactivate; run webhooks) |
| `n8n_katwill_remote_*` | Advanced SDK tools (search nodes, get type defs, validate & create workflows from code, manage data tables, etc.) |

**Prefer `n8n_katwill_remote_*` for building workflows** — it supports the n8n Workflow SDK (`create_workflow_from_code`, `validate_workflow`, `search_nodes`, `get_node_types`, `get_sdk_reference`).

## Workflow Creation Flow

1. **Plan**: Identify triggers, API calls, logic nodes, and their connections.
2. **Look up node types**: Use `search_nodes` to find node IDs, then `get_node_types` to get exact parameter schemas.
3. **Write code**: Use the n8n Workflow SDK (`import { workflow, node, trigger, ... } from '@n8n/workflow-sdk'`).
4. **Validate**: Always run `validate_workflow` before attempting creation.
5. **Create**: Use `create_workflow_from_code` with `projectId` resolved via `search_projects`.

## Key Rules

- Always call `get_sdk_reference` before writing SDK code if unfamiliar with the syntax.
- Use `newCredential(...)` for credentials, never hard-code secrets.
- Use `expr(...)` for n8n expressions inside node parameters.
- When editing existing workflows, use `update_workflow` with atomic operations rather than recreating.
- Always resolve project IDs via `search_projects` before creating workflows.
- **All workflow names must be prefixed with `COOLTECH_`** (e.g. `COOLTECH_Inbox_to_Job`).

## ServiceM8 Integration

- Base URL: `https://api.servicem8.com/api_1.0`
- Auth: `X-Api-Key` header (use `httpHeaderAuth` credential type)
- No native n8n node — use HTTP Request nodes.
- Main endpoints: inbox, job, jobcontact, queue.

## GitHub Repository

- Remote: `https://github.com/EdCadorniga/cooltech_n8n`
- Always commit workflow changes to this repo for version tracking.
- Keep `.env` in `.gitignore` — never commit secrets.
