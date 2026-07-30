Here’s the demo custody path in order (Rice / same pattern for other commodities):

```
FCI depot  →  State godown  →  Block godown  →  FPS shop  →  Beneficiary
```

| # | What happens | Who does it | Login |
|---|--------------|-------------|--------|
| 1 | **Stage-I dispatch** — stock leaves FCI toward state godown | FCI Depot Officer | `demo-fci` |
| 2 | **Confirm receipt at state godown** | Godown Operator | `demo-godown` |
| 3 | **DSO approves Release Order** for Stage-II (state → block) | District Supply Officer (DSO) | `demo-department` |
| 4 | **Stage-II dispatch** — state godown sends to block godown | Godown Operator | `demo-godown` |
| 5 | **Confirm receipt at block godown** | Godown Operator | `demo-godown` |
| 6 | **BSO allot to FPS** — block stock allotted to FPS-101 | Block Supply Officer (BSO) | `demo-block-office` |
| 7 | **FPS confirm receipt** | FPS Dealer | `demo-fps` |
| 8 | **Authenticate & issue ration** (last mile — not a warehouse move) | FPS Dealer | `demo-fps` |

**Who authorizes what**
- **FCI** starts Stage-I (procurement/depot origin).
- **Godown** receives/dispatches physical stock.
- **DSO** is the Stage-II **authorization** gate (Release Order) before state→block dispatch.
- **BSO** authorizes **FPS allotment**.
- **FPS** confirms shop receipt, then issues to the beneficiary.

So after FCI, stock does **not** go straight to FPS — it goes **state godown → (DSO RO) → block godown → (BSO allot) → FPS**.