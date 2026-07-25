# ViksitPDS Deployment

The maintained deployment and operations instructions are in the
[controlled-demo deployment guide](fabric-deployment.md).

That guide covers:

- PostgreSQL, Keycloak/OIDC, one API replica, and the React web application;
- database-backed roles, FPS assignments, and integration-service assignments;
- fixture-backed SMART-PDS/RCMS, state-SCM, and AePDS/ePoS event ingestion;
- Fabric 2.5.15 two-peer bootstrap and chaincode upgrades;
- asynchronous proof/outbox status and separate operational/proof completion;
- authorized reset/reseed and live lifecycle gates;
- privacy, troubleshooting, and the external pilot release gate.

ViksitPDS is a controlled demonstration and near-MVP trust layer. It is not
production-ready and does not replace authoritative state PDS systems.

The current runtime uses the in-memory domain engine with serialized PostgreSQL
snapshots, and snapshot saving and proof-outbox insertion are separate
operations. Run exactly one API replica. Do not claim crash atomicity,
concurrent mutation safety, or pilot readiness until the
[MVP hardening plan](docs/implementation/mvp-hardening-plan.md) is complete.

For a public browser demo on EC2 (HTTPS via Compose `--profile edge` / Caddy),
see [aws-ec2-https-demo.md](docs/implementation/aws-ec2-https-demo.md).
Plain `http://<public-ip>:4173` cannot complete Sign in with Keycloak because
OIDC PKCE requires a secure context.

For a single E2E Networks node Fabric controlled demo (Compose, public IP, IAM
public-origin helper), see
[e2e-networks-fabric-demo.md](docs/implementation/e2e-networks-fabric-demo.md).
