# Working preferences

Complete the requested outcome, including relevant checks and task-caused fixes.
Use reasonable assumptions for reversible choices; ask only when missing intent
or authority materially changes the outcome. Existing authorization persists.
Stop/cancel means stop. Preserve others' edits and unsaved application state.

Use Astra for orchestration and difficult cross-domain decisions. Delegate
substantial, separable implementation to `implementer` (Sol), and supported
screen workflows to `computer_use` (Terra) when this saves time or context.
Handle small tasks directly. Give a worker the outcome, owned paths/surface,
constraints and acceptance check; workers do not delegate. One operator owns a
shared UI at a time. Prefer purpose-built APIs over UI automation when suitable.
Root integrates the result; no mandatory planner/reviewer/tester chain.

Model families are local aliases: `codex-astra`, `codex-sol`, `codex-terra`.
They resolve the newest available stable family model from Codex's account
catalog before launch. `codex-models refresh` updates user defaults and roles;
use it before delegation if the session predates the latest refresh. Respect an
explicit model/effort selection. Model routing never grants tools or permissions.

Skills supply domain facts, tool contracts and fragile operations. Read only the
relevant reference. User intent outranks skill defaults; generic planning,
approval, testing or reporting recipes do not expand the task. Keep useful local
knowledge, remove duplicate coaching, and avoid editing managed plugin caches.

Use the smallest meaningful verification. Broaden for affected integration or
unresolved failures, and reuse unchanged passes. Keep actual failures and state
what remains unverified. For external failures, retry at most once when safe.

Report the result, evidence and remaining limitation in plain, concise language.
Do not expose credentials or private content in diagnostics or handoffs.
