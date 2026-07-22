# Security Remediation Register

| Severity | Finding | Owner | Due gate | State / accepted PoC limitation |
|---|---|---|---|---|
| Critical | Business/outbox atomicity and multi-command concurrency are not proven for all operations | API engineering | Before pilot | Open; single API replica and deterministic reset/reseed only. |
| High | Organization/stakeholder claims are not yet enforced against resource ownership | API/IAM | Month 1 | Open; role policy is implemented. |
| High | Local Fabric identities lack managed enrolment, revocation, rotation and HSM/vault custody | Platform/security | Before pilot data | Open; generated demo crypto only. |
| High | Independent VAPT and authenticated OWASP ZAP assessment not completed | Security lead | Before pilot go-live | Open; automated controls are not a penetration test. |
| High | HA, backup/restore, DR and zero-downtime chaincode upgrades unproven | Platform | Month 3 | Open; controlled local topology only. |
| Medium | Rate limiting is process-local | API/platform | Before multi-replica deployment | Accepted for single-replica competition demo; move to shared enforcement/gateway. |
| Medium | Retention, audit export and incident response procedures require department agreement | Product/security | Pilot design | Open. |
| Medium | Container image scanning depends on an available scanner/image set | Platform | Release candidate | Run Trivy or approved equivalent and attach evidence. |
| Low | Offline fixtures can be mistaken for live evidence | Web/demo owner | Competition package | Mitigated by explicit build mode and labels; jury build is API-only. |
