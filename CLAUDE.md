# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

# Interaction Workflow

## Mandatory Interaction Cycle

For EVERY requested modification, ALWAYS follow this exact sequence:

1. Analyze the request.
2. Explain the intended changes briefly and clearly.
3. Ask for explicit approval BEFORE making any modification.
4. Apply only the approved changes.
5. Summarize exactly what was changed.
6. Ask whether additional modifications are desired.
7. If the user says "no", "that's all", or equivalent:

   * STOP immediately.
   * Do not continue exploring/refactoring autonomously.
   * Do not suggest unrelated improvements.
   * Do not continue running commands.
   * End the task cleanly.

## Execution Restrictions

* Never continue autonomously after completing the requested task.
* Never perform "bonus" refactors or proactive improvements without approval.
* Never chain multiple unrelated operations together.
* Never execute credential-sensitive flows automatically.

## Approval Requirement

Before ANY of the following:

* editing files
* deleting files
* installing dependencies
* changing configs
* running migrations
* changing git state
* running external API operations
* running scripts that write to databases or external services

ALWAYS ask for confirmation first.

# Secret Handling Rules

## Runtime Secrets Only

* NEVER store real secrets in `.env` files.
* NEVER store real secrets in `google-ads.yaml`.
* NEVER ask the user to paste real secrets into source code, config files, workspace files, logs, or chat.
* ALWAYS prefer secure runtime prompts using Python `getpass` (or equivalent hidden-input methods).
* Secret input must never be echoed back to the terminal.

## Agent Execution Boundary

* After preparing or refactoring code, STOP before any execution requiring real credentials.
* NEVER execute flows requiring real secrets automatically.
* ALWAYS instruct the user to run credential-sensitive steps manually.
* Once code preparation is complete, end the task and wait for explicit user input before continuing.

## Safe Execution Model

Claude Code is responsible for:

* preparing code
* refactoring
* dependency setup
* environment preparation
* explaining execution steps

The user is responsible for:

* entering secrets
* running credential-sensitive commands
* approving execution involving external services/APIs
* approving database writes

# Scope Restrictions

* Stay strictly inside the current workspace/project.
* Do not access unrelated directories or system files.
* Do not modify git remotes, CI/CD configs, deployment settings, or infrastructure configs without approval.

# Git Safety

* Never commit automatically.
* Never push automatically.
* Always show intended git actions before executing them.

# Project Overview

This is a Python CLI data pipeline (`dashboard_paid/dashspy_v1.py`) that collects marketing data from Meta Ads, Google Ads, LinkedIn Ads, and HubSpot, then stores results in Supabase (PostgreSQL). Static HTML dashboards (`dashboard.html`, `charts-demo.html`) visualize the data using Chart.js.

# Setup & Running

```bash
cd dashboard_paid
pip install -r requirements.txt
```

## Secret Configuration

Use `.env.example` and `google-ads.example.yaml` only as references for required variable names and structure.

Do not create `.env` or `google-ads.yaml` containing real credentials during agent-assisted work.

When credentials are required:

* request them securely at runtime using hidden terminal input (`getpass`)
* never print them to logs or terminal output
* never persist them automatically to workspace files


## Running

Credential-sensitive flows must be executed manually by the user after Claude Code preparation is complete.

Example:

```bash
python dashspy_v1.py
```

There is no test suite, linter, or build system.

# Architecture

The main script is a single-file pipeline with five collection modules, each following the same pattern:

fetch → process → insert

| Module           | Source                         | Supabase table           |
| ---------------- | ------------------------------ | ------------------------ |
| Meta Ads         | Graph API                      | `teste_data_meta_01`     |
| Google Ads       | Google Ads API (GAQL)          | `teste_data_google_01`   |
| LinkedIn Ads     | REST API via `subprocess curl` | `teste_data_linkedin_01` |
| HubSpot Contacts | HubSpot v3 API                 | `teste_01`               |
| HubSpot Deals    | HubSpot v3 API                 | `teste_data_deals_01`    |

# Pipeline Flow (`main()`)

1. Phase 1 – Collect:
   All five sources run sequentially (wrapped in try/except so one failure doesn't abort the rest). Each module tracks its own last sync date and only fetches new data.

2. Phase 2 – Confirm:
   User is prompted to review record counts before writes occur.

3. Phase 3 – Insert:
   Approved data is inserted to Supabase.

IMPORTANT:

* Database writes require explicit user approval before execution.
* Credential-sensitive API calls require explicit user approval before execution.

# Key Patterns

* Rate limiting:
  Meta, LinkedIn, and HubSpot use exponential backoff retry loops.

* Windowed collection:
  HubSpot contacts are fetched in 1-day chunks to stay under the 10K result limit per query.

* Streaming inserts:
  HubSpot modules may insert during collection to preserve progress on large datasets.

* Logging:
  Uses `rich` for colored console output and writes to `dashspy.log`.

# LinkedIn Ads

LinkedIn uses `subprocess` to call `curl` directly (rather than an SDK), because the LinkedIn Marketing API requires specific header handling. The raw JSON response is then parsed with `json.loads`.