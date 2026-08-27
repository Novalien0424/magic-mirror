# Model Routing Rationale — August 2026

## Decision

Use `gpt-5.6-sol / medium` as the direct primary executor. Keep Luna for
optional subagents, but reserve `Luna / max` for difficult, precisely bounded
read-only review rather than every task.

## Why Luna/max should not be universal

The optimization target is not API dollars alone:

```text
total engineering cost
= model cost
+ serial wall-clock delay
+ repeated context loading
+ coordination/retry cost
+ cost of wrong or incomplete changes
```

A mandatory worker before a one-line diagnostic is expensive in developer
time. Fresh ephemeral workers also reread instructions and task context,
multiplying latency and coordination cost.

## Chosen routing

- Sol/medium direct: best critical-path balance for ambiguous implementation,
  debugging, tool use, and final synthesis.
- Luna/high surveyor or implementer: clear bounded delegated work where the
  answer shape is known.
- Luna/low tester: command execution does not benefit from max reasoning.
- Luna/max deep reviewer: difficult static reasoning with exact scope and
  explicit acceptance criteria, preferably parallel or off the critical path.

This keeps the strong cost/quality characteristic you value while removing the
serial orchestration pattern that caused the observed latency.
