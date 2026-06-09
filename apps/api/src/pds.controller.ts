import {
  Body,
  Controller,
  Get,
  Param,
  Query,
  Post
} from '@nestjs/common';
import { AuthMode, AuthResult } from '@pds/shared-types';
import { PdsService } from './pds.service.js';
import {
  AllocationDto,
  AuthOtpDto,
  DispatchDto,
  DistributionDto,
  EntitlementValidateDto,
  LotCreateDto,
  StakeholderCreateDto,
  SupervisorExceptionAuthDto,
  TransferReceiveDto
} from './dto.js';
import { OPENAPI_SPEC } from './openapi.js';

@Controller()
export class PdsController {
  constructor(private readonly service: PdsService) {}

  @Get('/health')
  health() {
    return { ok: true };
  }

  @Get('/dashboard/summary')
  summary() {
    return this.service.getDashboardSummary();
  }

  @Get('/stakeholders')
  stakeholders() {
    return this.service.listStakeholders();
  }

  @Get('/lots')
  lots() {
    return this.service.listLots();
  }

  @Get('/lots/:lotId')
  lot(@Param('lotId') lotId: string) {
    return this.service.getLot(lotId);
  }

  @Get('/transfers')
  transfers() {
    return this.service.listTransfers();
  }

  @Get('/transfers/:transferId')
  transfer(@Param('transferId') transferId: string) {
    return this.service.getTransfer(transferId);
  }

  @Get('/fps-allocations')
  allocations() {
    return this.service.listAllocations();
  }

  @Get('/fps-allocations/:allocationId')
  allocation(@Param('allocationId') allocationId: string) {
    return this.service.getAllocation(allocationId);
  }

  @Get('/distributions')
  distributions() {
    return this.service.listDistributions();
  }

  @Get('/auth/transactions')
  authTransactions() {
    return this.service.listAuthTransactions();
  }

  @Get('/auth/transactions/:authTxnId')
  authTransaction(@Param('authTxnId') authTxnId: string) {
    return this.service.getAuthTransaction(authTxnId);
  }

  @Get('/openapi.json')
  openapi() {
    return OPENAPI_SPEC;
  }

  @Post('/stakeholders')
  registerStakeholder(@Body() body: StakeholderCreateDto) {
    return this.service.registerStakeholder(body);
  }

  @Post('/lots')
  createLot(@Body() body: LotCreateDto) {
    return this.service.createCommodityLot(body);
  }

  @Get('/lots/:lotId/history')
  lotHistory(@Param('lotId') lotId: string) {
    return this.service.getLotHistory(lotId);
  }

  @Post('/transfers')
  dispatch(@Body() body: DispatchDto) {
    return this.service.dispatchLot(body);
  }

  @Post('/transfers/:transferId/receive')
  receive(@Param('transferId') transferId: string, @Body() body: TransferReceiveDto) {
    return this.service.receiveLot({ transferId, receivedQtyKg: body.receivedQtyKg });
  }

  @Post('/fps-allocations')
  allocate(@Body() body: AllocationDto) {
    return this.service.allocateToFps(body);
  }

  @Post('/fps-allocations/:allocationId/receipt')
  fpsReceipt(@Param('allocationId') allocationId: string, @Body() body: TransferReceiveDto) {
    return this.service.recordFpsReceipt({ allocationId, receivedQtyKg: body.receivedQtyKg });
  }

  @Post('/auth/mock-otp')
  authOtp(@Body() body: AuthOtpDto) {
    return this.service.simulateAuthentication({
      ...body,
      authMode: AuthMode.MOCK_OTP
    });
  }

  @Post('/auth/simulated-biometric')
  authBiometric(@Body() body: AuthOtpDto) {
    return this.service.simulateAuthentication({
      ...body,
      authMode: AuthMode.SIMULATED_BIOMETRIC
    });
  }

  @Post('/auth/supervisor-exception')
  authException(@Body() body: SupervisorExceptionAuthDto) {
    return this.service.simulateAuthentication({
      ...body,
      authMode: AuthMode.SUPERVISOR_EXCEPTION,
      authResult: AuthResult.EXCEPTION_APPROVED
    });
  }

  @Get('/entitlements/:rationCardHash')
  entitlements(
    @Param('rationCardHash') rationCardHash: string,
    @Query('commodity') commodity = 'Rice',
    @Query('month') month = '2026-06'
  ) {
    return this.service.getEntitlement(rationCardHash, commodity, month);
  }

  @Get('/entitlements')
  entitlementList() {
    return this.service.listEntitlements();
  }

  @Post('/entitlements/validate')
  validate(@Body() body: EntitlementValidateDto) {
    return this.service.validateEntitlement(body);
  }

  @Post('/distributions')
  distribute(@Body() body: DistributionDto) {
    return this.service.recordDistribution(body);
  }

  @Get('/distributions/:distributionId')
  distribution(@Param('distributionId') distributionId: string) {
    return this.service.getDistributionReceipt(distributionId);
  }

  @Get('/trace/lots/:lotId')
  lotTrace(@Param('lotId') lotId: string) {
    return this.service.getTraceForLot(lotId);
  }

  @Get('/audit-alerts')
  alerts() {
    return this.service.getAlerts();
  }

  @Post('/audit-alerts/reconcile')
  reconcile() {
    return this.service.reconcileAlerts();
  }

  @Post('/audit-alerts/:alertId/resolve')
  resolveAlert(
    @Param('alertId') alertId: string,
    @Body() body: { resolvedBy: string; resolutionNote: string }
  ) {
    return this.service.resolveAuditAlert({ alertId, resolvedBy: body.resolvedBy, resolutionNote: body.resolutionNote });
  }
}
