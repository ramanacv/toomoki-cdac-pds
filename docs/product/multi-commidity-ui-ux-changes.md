# Multi-commodity workbench & lots visibility redesign

> Historical UI redesign note. Current FPS identity, provenance, and status
> behavior is specified in the [feature specification](feature-spec.md).

## Context

Multi-commodity support (Rice, Wheat, Dal, Sugar, Cooking Oil, Kerosene — see `COMMODITIES` / `COMMODITY_ROUTE_TEMPLATES` in [packages/shared-types/src/index.ts](packages/shared-types/src/index.ts)) was recently layered onto a UI that was built assuming a single commodity (Rice). Two problems have surfaced for the product owner testing the demo:

1. **Confusing dropdown.** [WorkflowActionPanel.tsx:215-229](apps/web/src/components/WorkflowActionPanel.tsx) has one "Commodity route" `Select` that gates the *entire* workbench — `getWorkflowActions`/`getRoleQueue` in [workflow-actions.ts](apps/web/src/workflow-actions.ts) only compute actions for the single selected commodity (default `'Rice'`). A user has to manually flip through all 6 commodities to discover pending work, with no indicator of which ones have anything waiting. The same silent Rice-only bug also affects the "Queued actions" dashboard metric in [role-summary.ts:63](apps/web/src/lib/role-summary.ts).
2. **No lots overview.** [LotsPage.tsx](apps/web/src/pages/workspace/LotsPage.tsx) → `TraceSection` → [TraceExplorer.tsx](apps/web/src/components/TraceExplorer.tsx) shows one lot at a time via a flat, unfiltered dropdown. There is no place to see all lots at a glance grouped by status (pending vs received vs shortage) to decide what needs action.

Goal: make cross-commodity work visible by default (no per-commodity toggling required to discover pending items), and give users a table-based lots overview they can filter and drill into — while reusing existing design-system pieces (`Panel`, `Table`, `Tabs`, `Badge`, `HintLabel`) and leaving the single-commodity business logic in `workflow-actions.ts` untouched.

## Approach

**Aggregate instead of gate.** Add additive helpers in `workflow-actions.ts` that loop over all 6 `COMMODITIES` (cheap, pure, no I/O — fine at this scale) and return per-commodity groups. Replace the single "Commodity route" dropdown in the workbench with a grouped-by-commodity view that shows everything by default, plus an optional `Tabs` filter (using the already-built-but-unused [ui/tabs.tsx](apps/web/src/components/ui/tabs.tsx)) with a pending-count badge per commodity for quick scanning. Do not touch `getWorkflowActions`/`getRoleQueue`/`getWorkflowProgress` signatures — existing tests and `role-summary.ts` call sites that omit the commodity arg keep working.

**Add a Lots table.** New `LotsPanel` in [DataPanels.tsx](apps/web/src/components/DataPanels.tsx), following the exact pattern already used for `TransfersPanel` (Table/TableHeader/TableBody/TableRow/TableHead/TableCell), with a `Tabs` status filter (All/Pending/Received/Shortage) derived from the existing `LotStatus` enum — no new business logic, purely presentational. Render it above the existing single-lot drill-down on `LotsPage.tsx`, row-click sets the drill-down's selected lot.

## Changes

### 1. `apps/web/src/workflow-actions.ts` — additive aggregation helpers

Add after `getRoleQueue`/`getWorkflowActions`, without touching any existing function:

```ts
export type CommodityActionGroup = { commodity: CommodityName; actions: WorkflowActionSpec[] };

export function getAllCommoditiesWorkflowActions(context: WorkflowContext): CommodityActionGroup[] {
  return COMMODITIES.map((def) => ({ commodity: def.name, actions: getWorkflowActions(context, def.name) }));
}

export function getAllCommoditiesRoleQueue(context: WorkflowContext, role: DemoRole): CommodityActionGroup[] {
  return COMMODITIES.map((def) => ({ commodity: def.name, actions: getRoleQueue(context, role, def.name) }))
    .filter((group) => group.actions.length > 0);
}

export function getAllCommoditiesWorkflowProgress(context: WorkflowContext): Array<{ commodity: CommodityName; completed: number; total: number }> {
  return COMMODITIES.map((def) => ({ commodity: def.name, ...getWorkflowProgress(context, def.name) }));
}
```

`getAllCommoditiesRoleQueue` drops empty groups (nothing to "forget to check"); `getAllCommoditiesWorkflowActions` stays unfiltered so MANAGEMENT keeps seeing all 6 commodities' full action lists, matching today's per-commodity `allActions` semantics.

### 2. `apps/web/src/lib/role-summary.ts` — fix the same Rice-only bug in the dashboard metric

Line 63 currently: `const queue = getRoleQueue(data, role);` (implicitly Rice-only). Change to:
```ts
const queue = getAllCommoditiesRoleQueue(data, role).flatMap((g) => g.actions);
```
so the "Queued actions" summary card matches the new cross-commodity workbench. No existing test in `role-summary.test.ts` asserts a hardcoded queue count (verified — only a generic "4 cards per role" length check), so this is low-risk.

### 3. `apps/web/src/components/WorkflowActionPanel.tsx` — replace dropdown with grouped view + Tabs filter

- Remove `selectedCommodity` state, the `Select`-based "Commodity route" block (lines ~215-229), and the now-unused `Select*` imports.
- Add `Tabs, TabsList, TabsTrigger` from `@/components/ui/tabs.js`. New state: `commodityFilter: CommodityName | 'ALL'` (default `'ALL'`).
- `groupsForRole = role === 'MANAGEMENT' ? getAllCommoditiesWorkflowActions(context) : getAllCommoditiesRoleQueue(context, role)`; `visibleGroups` filters by `commodityFilter` when not `'ALL'`.
- Tabs row: `All (<total non-blocked count>)` plus one tab per `COMMODITIES` entry, each showing a `Badge` with that commodity's non-blocked action count (0 → no badge).
- Aggregate progress pill: sum `getAllCommoditiesWorkflowProgress(context)` across commodities instead of the single-commodity `progress`.
- Render one section per group in `visibleGroups` (commodity name + action count as a small header, e.g. `data-testid={`commodity-group-${group.commodity}`}` for stable test scoping), each still using the existing per-action card JSX unchanged (label, detail, badge, editable quantity, Run/Waiting button — no changes to `runAction`, `getEditableQuantity`, or button logic).
- Empty state: show the terminal "Journey complete..." message only when `groupsForRole` (unfiltered by tab) is empty; if a tab filter yields zero actions but other commodities still have pending work, show a lighter "No pending actions for {commodityFilter}." message instead.
- Drop the trailing `{!nextActionAllowed && ...}` banner — it doesn't generalize across independent per-commodity queues and is redundant with the per-card "Pending with / Selected role" info already shown.

### 4. `apps/web/src/components/DataPanels.tsx` — new `LotsPanel`

Add (imports needed: `LotStatus` as a value import from `@pds/shared-types`, `Tabs/TabsList/TabsTrigger`, `useState`):

```tsx
export function LotsPanel({ lots, onSelectLot }: { lots: CommodityLot[]; onSelectLot?: (lotId: string) => void }) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'RECEIVED' | 'SHORTAGE'>('ALL');
  const isPending = (lot: CommodityLot) => lot.status === LotStatus.CREATED || lot.status === LotStatus.DISPATCHED;
  const isShortage = (lot: CommodityLot) => lot.status === LotStatus.RECEIVED_WITH_SHORTAGE;
  const isReceived = (lot: CommodityLot) => lot.status === LotStatus.RECEIVED || isShortage(lot);
  // filter by statusFilter, render Tabs (All/Pending/Received/Shortage with counts) + Table
  // columns: Lot ID, Commodity, Status (badge, warning tone for shortage), Quantity, Current owner, Current location
  // TableRow onClick={() => onSelectLot?.(lot.lotId)} when onSelectLot provided
}
```

"Pending" is derived purely from `LotStatus` (CREATED/DISPATCHED), not from whether a workflow action currently references the lot — `WorkflowActionSpec` doesn't carry a `lotId` for every action kind, so joining against it would require extra plumbing for no real benefit at POC scale. This keeps the table role-agnostic and free of duplicated business logic.

### 5. `apps/web/src/pages/workspace/LotsPage.tsx` — table-first layout

**Do not touch `TraceSection.tsx`** — it's also used by [VerifyPage.tsx](apps/web/src/pages/workspace/VerifyPage.tsx), so it must stay a self-contained component. Instead, inline `TraceExplorer` directly into `LotsPage.tsx` (lifting `selectedLotId`/`selectedDistributionId` state locally) so `LotsPanel`'s row-click and `TraceExplorer`'s drill-down share state:

```tsx
export function LotsPage() {
  const { scenario, workspace } = useWorkspaceContext();
  const [selectedLotId, setSelectedLotId] = useState('LOT-RICE-2026-001');
  const [selectedDistributionId, setSelectedDistributionId] = useState('DIST-2026-001');
  return (
    <div className="flex flex-col gap-6">
      <LotsPanel lots={workspace.lots} onSelectLot={setSelectedLotId} />
      <TraceExplorer
        lots={workspace.lots}
        transfers={workspace.transfers}
        distributions={workspace.distributions}
        traceCards={getTraceCards(scenario)}
        selectedLotId={selectedLotId}
        selectedDistributionId={selectedDistributionId}
        onLotChange={setSelectedLotId}
        onDistributionChange={setSelectedDistributionId}
      />
    </div>
  );
}
```
The existing lot-ID dropdown inside `TraceExplorer` stays as a secondary fine-grained selector for the drill-down — harmless now that the table is the primary "see everything" view.

## Test updates

- **`apps/web/test/workflow-actions.test.ts`** — add cases for the 3 new helpers: `getAllCommoditiesWorkflowActions` returns exactly 6 groups matching `getWorkflowActions(ctx, name)` per commodity; `getAllCommoditiesRoleQueue` filters out empty groups. No changes needed to existing tests (they call the untouched single-commodity functions).
- **`apps/web/test/workflow-panel.test.tsx`** — **confirmed regression**: the 4 `role="PROCUREMENT"` tests around lines 225-292 (`getByLabelText('Dispatch quantity (kg)')`) will break. Verified via `mock/entities/lots.json`: `PROC-001` owns stock for Wheat, Dal, Sugar, Cooking Oil, and Kerosene lots directly, and Rice's source lot is matched by `lotId` regardless of owner — so with `baseProps.transfers = []`, PROCUREMENT's aggregated queue now has a "Dispatch quantity (kg)" action in **all 6** commodity groups simultaneously, and `getByLabelText` throws on multiple matches. Fix: scope those 4 assertions to the Rice group via the `data-testid="commodity-group-Rice"` wrapper from change #3, e.g. `within(screen.getByTestId('commodity-group-Rice')).getByLabelText('Dispatch quantity (kg)')`.
  Also add: a test asserting the removed dropdown is gone (`queryByLabelText('Commodity route')` → null), a test with a fixture producing pending actions in ≥2 commodities asserting both group headers render without any tab interaction, and a MANAGEMENT-role test asserting all 6 groups render.
- **`apps/web/test/role-summary.test.ts`** — reviewed in full; no hardcoded "Queued actions" values exist, only a generic 4-cards-per-role length check. No changes required, but re-run to confirm after the `role-summary.ts` change.
- **New `apps/web/test/data-panels-lots.test.tsx`** (or similar) — render `LotsPanel` with one lot per status, assert default view shows all, each tab filters correctly, and `onSelectLot` fires with the clicked row's lot id.

## Watch-outs

- `CommodityLot.commodity` is typed `string`, not `CommodityName` — keep comparisons as plain strings (matches existing `TransfersPanel` treatment).
- Radix `Tabs`'s `onValueChange` is `(value: string) => void` — cast to `CommodityName | 'ALL'` at the call site.
- `LotStatus` must be imported as a value (not `import type`) in `DataPanels.tsx` since it's an enum.
- Remove now-unused `Select*` imports in `WorkflowActionPanel.tsx` to avoid unused-import build/lint failures.
- This plan only touches `apps/web/src/**`; it depends solely on already-stable exports (`COMMODITIES`, `CommodityName`, `CommodityLot`, `LotStatus`, `getCommodityRouteTemplate`) that `workflow-actions.ts` already imports today, so it's resilient to unrelated in-flight changes elsewhere in the repo (fixtures/shared-types/mock data). `git status` is currently clean on this branch, so no conflicting uncommitted work is present right now.

## Verification

1. `cd apps/web && npx tsc --noEmit -p .` — no new type errors introduced by these files.
2. `npx vitest run test/workflow-actions.test.ts test/workflow-panel.test.tsx test/role-summary.test.ts` (plus the new lots-panel test file) — all green, including the updated PROCUREMENT-role scoped queries.
3. `docker compose build web && docker compose up -d web`, then manually click through in the browser:
   - Workbench (`/workbench`) as PROCUREMENT with a fresh/seeded state: confirm multiple commodity sections render simultaneously with correct badge counts, "All" tab shows everything, clicking a commodity tab filters to just that section, running an action still works exactly as before.
   - Workbench as MANAGEMENT: confirm all 6 commodity groups render.
   - Lots page (`/lots`): confirm the new table shows all lots, tab filters work (All/Pending/Received/Shortage counts match visible rows), clicking a row updates the custody-timeline drill-down below it.
   - Verify page (`/verify`) still works unchanged (uses `TraceSection`, untouched).
