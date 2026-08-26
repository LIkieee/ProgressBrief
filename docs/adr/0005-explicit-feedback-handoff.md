# Use a durable queue and one explicit feedback handoff

The creator review UI will persist feedback atomically and provide the exact Codex or Claude Code skill invocation for the user to run in the active session. This one-step handoff is the portable V1 contract because neither host guarantees a stable cross-platform API for controlling an arbitrary active session; tested host adapters may add one-click handoff without replacing the durable queue fallback.
