# Issue 1: Credential Storage and API Trust

## Vulnerability and severity

Passwords were stored as a single SHA-256 digest of `password + "salt"`. The salt was the same
literal value for every user. Equal passwords therefore produced equal hashes, and a database leak
would allow fast offline dictionary attacks to recover passwords across the entire user base. This
is a critical credential-compromise vulnerability.

The user and admin applications also discarded the JWT returned by the API and signed replacement
JWTs themselves using the API signing secret. A compromised client server, leaked shared secret, or
known fallback secret could forge another user's identity or an administrator role. The API was not
the sole authority establishing trust.

## Fix and migration

New passwords use Node's built-in `crypto.scrypt` with a cryptographically random 16-byte salt. The
stored value includes the algorithm, format version, work factors, salt, and derived key. Verification
uses `timingSafeEqual` after deriving a key of the expected length.

Existing 64-character hexadecimal SHA-256 values remain recognizable. A legacy password is verified
with the old algorithm using timing-safe comparison. Only after successful verification, login
creates a new scrypt hash and conditionally updates the row if the legacy value is still present.
Failed logins perform no write. This login-time migration requires no plaintext-password inventory
and keeps existing seeded and deployed users compatible.

The client cookie sessions now retain the API-issued JWT. Every authenticated gRPC call forwards
that exact token; neither client imports JWT signing code or reads `GRPC_JWT_SECRET`. Existing cookie
sessions without an API token are treated as unauthenticated and require login again. The API now
requires an explicit signing secret in production and uses an unshared process-random secret in
development instead of a repository-known fallback. API response and protobuf contracts are
unchanged.

## Compatibility and residual considerations

- Existing password rows require no schema migration and upgrade incrementally on successful login.
- Seeded users continue to authenticate with their documented passwords.
- Existing browser sessions created before this change must log in once to obtain an API token.
- Production deployments must provide the same `GRPC_JWT_SECRET` to every API instance.
- JWT revocation and production secret/TLS policy are separate concerns and were not expanded here.
