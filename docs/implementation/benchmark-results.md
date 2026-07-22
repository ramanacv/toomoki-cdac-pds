# Controlled Competition Benchmark

Last run: 2026-07-22T10:47:55.392Z

- Run ID: BENCH-20260722104651-1799410.
- Environment: 16 CPUs, 14.4 GiB RAM, Node v22.20.0.
- Setup: 20 opaque benchmark-only ration-card and beneficiary references were provisioned directly in PostgreSQL outside timed requests.
- Workload: 600 authenticated reads (concurrency 1, 5, 10) and 20 controlled lifecycle sequences (concurrency 1).
- API benchmark rate limits: 20000 reads/minute and 500 mutations/minute; secure defaults remain 120 and 30.
- Operational success: 100%; read p95 195.4 ms; mutation p95 8.8 ms.
- Proofs: 0/220 committed within the 60-second observation window; proof p95 not available; 0 unique Fabric transaction IDs at cutoff.
- Baseline outbox: PENDING=233, SUBMITTING=12, COMMITTED=1093, FAILED=0, DEAD_LETTER=0.
- Final outbox: PENDING=477, SUBMITTING=2, COMMITTED=1122, FAILED=0, DEAD_LETTER=0.

## Acceptance targets

- PASS — requestSuccess
- MISS — proofsCommittedWithin60s
- MISS — uniqueFabricTxIds
- MISS — noOutstandingProofs
- PASS — readP95Below250ms
- PASS — mutationP95Below500ms
- MISS — proofP95Below5s

## Observed blockers

- The run began with 245 outstanding proofs from earlier lifecycle attempts. The 220 benchmark proofs remained queued behind that backlog, so this is a recorded failed benchmark rather than clean capacity evidence.
- A preliminary lifecycle-concurrency-2 attempt failed during an inter-stage transfer because the current serialized snapshot persistence is not concurrent-mutation safe. The recorded run therefore used lifecycle concurrency 1.
- No proof was `FAILED` or `DEAD_LETTER` at cutoff; the missed proof targets were caused by outstanding `PENDING`/`SUBMITTING` work.

## Limitations

- Controlled local benchmark; not evidence of multi-replica, wide-area, failover, crash-atomicity or production capacity.
- Lifecycle mutations were serialized because the current snapshot persistence is not concurrent-mutation safe.
- The raw local evidence is retained outside Git under `/tmp`; this maintained file is the sanitized summary.
