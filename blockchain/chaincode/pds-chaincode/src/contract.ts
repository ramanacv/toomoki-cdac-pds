import { Context, Contract } from 'fabric-contract-api';
import type { LedgerEvent, Stakeholder } from '@pds/shared-types';
import { PdsLedgerEngine } from './index.js';

const WORLD_STATE_KEY = 'pds.state';

const loadEngine = async (ctx: Context): Promise<PdsLedgerEngine> => {
  const engine = new PdsLedgerEngine(false);
  const raw = await ctx.stub.getState(WORLD_STATE_KEY);
  if (raw.length > 0) {
    engine.restoreState(JSON.parse(raw.toString()));
  }
  return engine;
};

const persistEngine = async (ctx: Context, engine: PdsLedgerEngine): Promise<void> => {
  await ctx.stub.putState(WORLD_STATE_KEY, Buffer.from(JSON.stringify(engine.exportState())));
};

export class PdsChainContract extends Contract {
  async RegisterStakeholder(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.registerStakeholder(JSON.parse(payloadJson) as Stakeholder);
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async CreateCommodityLot(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.createCommodityLot(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async DispatchLot(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.dispatchLot(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async ReceiveLot(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.receiveLot(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async AllocateToFPS(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.allocateToFps(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async RecordFPSReceipt(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.recordFpsReceipt(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async RegisterBeneficiaryHash(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.simulateAuthentication(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async CreateMonthlyEntitlement(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.createOrUpdateEntitlement(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async RecordDistribution(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.recordDistribution(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async RaiseAuditFlag(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.raiseAuditFlag(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async ResolveAuditFlag(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.resolveAuditAlert(JSON.parse(payloadJson));
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async RecordLedgerProof(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const result = engine.applyLedgerEvent(JSON.parse(payloadJson) as LedgerEvent);
    await persistEngine(ctx, engine);
    return JSON.stringify(result);
  }

  async GetLotHistory(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const payload = JSON.parse(payloadJson) as { lotId: string };
    return JSON.stringify(engine.getLotHistory(payload.lotId));
  }

  async GetDistributionHistory(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const payload = JSON.parse(payloadJson) as { distributionId: string };
    return JSON.stringify(engine.getDistributionHistory(payload.distributionId));
  }

  async GetCurrentStock(ctx: Context): Promise<string> {
    const engine = await loadEngine(ctx);
    return JSON.stringify(engine.exportState().stock);
  }

  async VerifyDatabaseHash(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const payload = JSON.parse(payloadJson) as { digest: string };
    return JSON.stringify(engine.verifyDatabaseHash(payload));
  }

  async CheckDuplicateClaim(ctx: Context, payloadJson: string): Promise<string> {
    const engine = await loadEngine(ctx);
    const payload = JSON.parse(payloadJson) as {
      rationCardHash: string;
      commodity: string;
      month: string;
      requestedQtyKg: number;
    };
    return JSON.stringify(engine.checkDuplicateClaim(payload));
  }
}

export const contracts: Array<new () => Contract> = [PdsChainContract];
