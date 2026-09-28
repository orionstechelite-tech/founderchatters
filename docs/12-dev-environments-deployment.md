# 12 — Dev Environments & Deployment

## Local
Docker Compose:
- PostgreSQL
- Redis

Web/API run on host during development.

## Environments
development / test / staging / production

Never share DBs, session secrets, provider credentials, or buckets across environments.

## Initial VPS
- TLS/reverse proxy
- web container
- API container
- worker container
- PostgreSQL
- Redis
- external object storage
- off-server backups

## AWS-ready target
- ECS Fargate
- ALB
- RDS PostgreSQL
- ElastiCache
- S3
- CloudWatch
- SSM/Secrets Manager
- SQS-compatible queue if required later

## Production gate
- migration review
- backup/rollback
- health checks
- smoke tests
- human approval
