import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { COMMODITIES, LotStatus, createdAtFromLotId, type CommodityLot } from '@pds/shared-types';
import { formatDateTime } from '@/lib/constants.js';
import { resetAdminLedger } from '@/admin-api.js';
import { createStockLot, loadLots } from '@/api.js';
import { Panel } from '@/components/Panel.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Badge } from '@/components/ui/badge.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog.js';
import { useAdminContext } from '@/hooks/use-admin-context.js';
import { getCurrentIdentity } from '@/auth-token.js';

const getCommodityDefaults = (commodity: string) =>
  COMMODITIES.find((item) => item.name === commodity) ?? COMMODITIES[0]!;

const formatLotCreatedAt = (lot: CommodityLot): string => {
  const iso = lot.createdAt ?? createdAtFromLotId(lot.lotId);
  return iso ? formatDateTime(iso) : '—';
};

export function AdminToolsPage() {
  const { apiOnline, stakeholders, refresh } = useAdminContext();
  const roles = getCurrentIdentity()?.roles ?? [];
  const canCreateStock = roles.includes('procurement');
  const canReset = roles.includes('demo-reset');

  const [stockCommodity, setStockCommodity] = useState('Rice');
  const [stockQuantityKg, setStockQuantityKg] = useState('10000');
  const [stockQualityGrade, setStockQualityGrade] = useState('A');
  const [stockOwner, setStockOwner] = useState('PROC-001');
  const [stockLocation, setStockLocation] = useState('Procurement Yard');
  const [stockSubmitting, setStockSubmitting] = useState(false);
  const [stockMessage, setStockMessage] = useState<string | null>(null);
  const [stockError, setStockError] = useState<string | null>(null);
  const [resetCommodity, setResetCommodity] = useState('ALL');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [issuedLots, setIssuedLots] = useState<CommodityLot[]>([]);
  const [lotsLoading, setLotsLoading] = useState(true);

  const refreshLots = useCallback(async () => {
    setLotsLoading(true);
    try {
      setIssuedLots(await loadLots(apiOnline));
    } finally {
      setLotsLoading(false);
    }
  }, [apiOnline]);

  useEffect(() => {
    void refreshLots();
  }, [refreshLots]);

  const selectCommodity = (commodity: string) => {
    const defaults = getCommodityDefaults(commodity);
    setStockCommodity(defaults.name);
    setStockQuantityKg(String(defaults.defaultTopUpQuantityKg));
    setStockQualityGrade(defaults.defaultQualityGrade);
  };

  const addStock = async () => {
    setStockSubmitting(true);
    setStockMessage(null);
    setStockError(null);
    try {
      const quantityKg = Number(stockQuantityKg);
      if (!Number.isFinite(quantityKg) || quantityKg <= 0) {
        throw new Error('Quantity must be a positive number');
      }
      const lot = await createStockLot({
        commodity: stockCommodity.trim(),
        quantityKg,
        qualityGrade: stockQualityGrade.trim(),
        currentOwner: stockOwner,
        currentLocation: stockLocation.trim()
      });
      const message = `Created ${lot.lotId} — ${lot.quantityKg.toLocaleString()} kg of ${lot.commodity} at ${lot.currentOwner}.`;
      setStockMessage(message);
      toast.success('Stock added', { description: message });
      await Promise.all([refresh(), refreshLots()]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to add stock';
      setStockError(message);
      toast.error('Failed to add stock', { description: message });
    } finally {
      setStockSubmitting(false);
    }
  };

  const resetLedger = async () => {
    setResetSubmitting(true);
    setResetMessage(null);
    setResetError(null);
    try {
      const result = await resetAdminLedger(resetCommodity === 'ALL' ? undefined : resetCommodity);
      const lotPreview = result.lots?.slice(0, 3).map((lot) => lot.lotId).join(', ') ?? '';
      const seriesNote = result.seriesId
        ? ` New series ${result.seriesId} — workbench will use new lot/transfer ids${lotPreview ? ` (e.g. ${lotPreview})` : ''}.`
        : '';
      const message = `${result.message}${seriesNote}`;
      setResetMessage(message);
      toast.success('Ledger reset', { description: `Series ${result.seriesId}` });
      await Promise.all([refresh(), refreshLots()]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to reset ledger';
      setResetError(message);
      toast.error('Reset failed', { description: message });
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4">
      <header className="px-1">
        <p className="eyebrow">ViksitPDS</p>
        <h2 className="text-3xl font-semibold tracking-tight">Admin tools</h2>
        <p className="mt-1 leading-relaxed text-muted-foreground">
          Controlled test-data top-ups and destructive ledger resets for authorized demo operators.
        </p>
      </header>

      {!apiOnline && (
        <Alert variant="destructive">
          <AlertTitle>API offline — showing demo fixtures</AlertTitle>
          <AlertDescription>
            The orange <strong>Demo data</strong> badge means the backend is unreachable. The lots
            table below is static mock data (<code className="text-xs">LOT-*-2026-001</code>), not
            the live ledger. <strong>Add stock</strong> and <strong>Reset ledger</strong> stay
            disabled until the API is back (for example <code className="text-xs">docker compose up -d api</code>).
          </AlertDescription>
        </Alert>
      )}

      <Panel eyebrow="Test data" title="Add stock" wide>
        <p className="mb-4 text-sm text-muted-foreground">
          Creates a new commodity lot and credits its quantity to the owning stakeholder's stock
          position — use this to keep testing once a lot has been fully issued downstream.
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div className="grid gap-2">
            <Label htmlFor="stock-commodity">Commodity</Label>
            <Select value={stockCommodity} onValueChange={selectCommodity}>
              <SelectTrigger id="stock-commodity">
                <SelectValue placeholder="Select a commodity" />
              </SelectTrigger>
              <SelectContent>
                {COMMODITIES.map((commodity) => (
                  <SelectItem key={commodity.slug} value={commodity.name}>
                    {commodity.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-quantity">Quantity (kg)</Label>
            <Input
              id="stock-quantity"
              type="number"
              min={1}
              value={stockQuantityKg}
              onChange={(event) => setStockQuantityKg(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-grade">Quality grade</Label>
            <Input
              id="stock-grade"
              value={stockQualityGrade}
              onChange={(event) => setStockQualityGrade(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-owner">Owning stakeholder</Label>
            <Select value={stockOwner} onValueChange={setStockOwner}>
              <SelectTrigger id="stock-owner">
                <SelectValue placeholder="Select a stakeholder" />
              </SelectTrigger>
              <SelectContent>
                {stakeholders.map((stakeholder) => (
                  <SelectItem key={stakeholder.stakeholderId} value={stakeholder.stakeholderId}>
                    {stakeholder.stakeholderId} — {stakeholder.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="stock-location">Location</Label>
            <Input
              id="stock-location"
              value={stockLocation}
              onChange={(event) => setStockLocation(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void addStock()} disabled={!apiOnline || stockSubmitting || !canCreateStock}>
            {stockSubmitting ? 'Adding stock…' : 'Add stock'}
          </Button>
          {!apiOnline && (
            <p className="text-sm text-muted-foreground">Disabled while API is offline (Demo data mode).</p>
          )}
          {!canCreateStock && (
            <p className="text-sm text-muted-foreground">The procurement role is required to create a lot.</p>
          )}
          {stockMessage && <p className="text-sm text-muted-foreground">{stockMessage}</p>}
        </div>
        {stockError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{stockError}</AlertDescription>
          </Alert>
        )}
      </Panel>

      <Panel eyebrow="Test data" title="Issued stock lots" pill={`${issuedLots.length} lots`} wide>
        <p className="mb-4 text-sm text-muted-foreground">
          {apiOnline
            ? 'Commodity lots currently on the live ledger, most recently created first.'
            : 'Fixture lots from demo data (API offline). Start the API to see live ledger lots after reset.'}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Lot ID</TableHead>
              <TableHead scope="col">Commodity</TableHead>
              <TableHead scope="col">Status</TableHead>
              <TableHead scope="col">Quantity</TableHead>
              <TableHead scope="col">Owner</TableHead>
              <TableHead scope="col">Location</TableHead>
              <TableHead scope="col">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...issuedLots].reverse().map((lot) => (
              <TableRow key={lot.lotId}>
                <TableCell className="font-semibold">{lot.lotId}</TableCell>
                <TableCell>{lot.commodity}</TableCell>
                <TableCell>
                  <Badge variant={lot.status === LotStatus.RECEIVED_WITH_SHORTAGE ? 'warning' : 'secondary'}>
                    {lot.status}
                  </Badge>
                </TableCell>
                <TableCell>{lot.quantityKg.toLocaleString()} kg</TableCell>
                <TableCell>{lot.currentOwner}</TableCell>
                <TableCell>{lot.currentLocation}</TableCell>
                <TableCell>{formatLotCreatedAt(lot)}</TableCell>
              </TableRow>
            ))}
            {!lotsLoading && issuedLots.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No stock lots issued yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Panel>

      <Panel eyebrow="Danger zone" title="Reset ledger" wide>
        <p className="mb-4 text-sm text-muted-foreground">
          Clears movements, allocations, distributions, stock, and related audit alerts, then
          reseeds initial lots under a <strong>new ID series</strong> (so Fabric never reuses lot
          or transfer identities) and resets entitlement balances back to their monthly limits.
          Stakeholders, ration cards, and entitlement rules are always left untouched. Scope this
          to one commodity to leave every other commodity's data and ledger history in place, or
          reset everything for a fully clean run.
        </p>
        <div className="mb-4 grid max-w-xs gap-2">
          <Label htmlFor="reset-commodity">Scope</Label>
          <Select value={resetCommodity} onValueChange={setResetCommodity}>
            <SelectTrigger id="reset-commodity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All commodities (full reset)</SelectItem>
              {COMMODITIES.map((commodity) => (
                <SelectItem key={commodity.slug} value={commodity.name}>
                  {commodity.name} only
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" variant="destructive" disabled={!apiOnline || resetSubmitting || !canReset}>
              {resetSubmitting
                ? 'Resetting…'
                : resetCommodity === 'ALL'
                  ? 'Reset ledger'
                  : `Reset ${resetCommodity}`}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {resetCommodity === 'ALL' ? 'Reset ledger data?' : `Reset ${resetCommodity} data?`}
              </DialogTitle>
              <DialogDescription>
                {resetCommodity === 'ALL'
                  ? 'This clears movement data and stock positions for every commodity on the running ledger, then reseeds the initial commodity lots. This cannot be undone.'
                  : `This clears movement data and stock positions for ${resetCommodity} only, then reseeds its initial lot. Other commodities are left untouched. This cannot be undone.`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogTrigger asChild>
                <Button variant="secondary">Cancel</Button>
              </DialogTrigger>
              <DialogTrigger asChild>
                <Button variant="destructive" onClick={() => void resetLedger()}>
                  Confirm reset
                </Button>
              </DialogTrigger>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {!canReset && <p className="mt-3 text-sm text-muted-foreground">The independent demo-reset role is required.</p>}
        {resetMessage && <p className="mt-3 text-sm text-muted-foreground">{resetMessage}</p>}
        {resetError && (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{resetError}</AlertDescription>
          </Alert>
        )}
      </Panel>
    </div>
  );
}
