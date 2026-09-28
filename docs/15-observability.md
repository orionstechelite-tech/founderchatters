# 15 — Observability

Structured logs:
- requestId
- service
- environment
- route
- status
- latency
- safe actor ID
- error code

Never log secrets or private message bodies.

Operational metrics:
- request/error/latency
- DB pool
- queue depth/failures
- email failures

Product metrics:
- asks
- asks with useful response
- first useful response time
- help confirmations
- contributions
- active helpers
- reports

Admin System Health exposes high-level status only.
