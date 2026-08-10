# Authentication & Security

## Login Flows

OAuth2 with PKCE is the primary login flow for native clients. Browser flows
use the authorization code grant with refresh token rotation.

## Password Policy

Minimum 12 characters, must include letters and digits. Failed attempts are
rate-limited and logged for audit.

## Access Control

RBAC roles: viewer, editor, admin. Secrets are stored in the vault and never
committed to source control. API tokens expire after 24 hours.
