# Task Queue

`queue.json` is designed for a 24×7 agent loop.

Statuses:
- pending
- working
- completed
- failed
- blocked

Authorization:
- AUTO_LOCAL
- HUMAN_APPROVAL_REQUIRED

Do not start until all `depends_on` tasks are completed.
