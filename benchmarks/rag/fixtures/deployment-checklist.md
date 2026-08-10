# Deployment Checklist

## Pre-deployment

- Backup the production database.
- Run migration scripts against a staging clone.
- Verify all API endpoints respond with 2xx.

## Deployment

- Tag the release and push to the artifact registry.
- Roll out to the canary group first.
- Monitor error rates for 15 minutes.

## Post-deployment

- Confirm authentication and authorization flows.
- Check background job queues for backpressure.
- Update the runbook with any rollback notes.
