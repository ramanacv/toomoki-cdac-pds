const demoQuantities = {
  fpsAllocationKg: 100,
  fpsReceiptKg: 100,
  citizenDistributionKg: 25,
  shortReceiptDispatchKg: 1000,
  shortReceiptReceivedKg: 800
};

export const createFabricClient = ({ apiBase, token }) => {
  const request = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${apiBase}${path}`, { ...init, headers });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = body?.message ?? text ?? response.statusText;
      const error = new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status} ${message}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  };

  return { request };
};

export const runHappyPathFabric = async ({ apiBase, token }) => {
  if (!token) {
    throw new Error('Fabric demo requires an OIDC service access token');
  }

  const { request } = createFabricClient({ apiBase, token });
  const prefix = `FAB-HAPPY-${Date.now()}`;

  const health = await request('/health');
  if (!health.ok) throw new Error('API health check failed');

  const allocation = await request('/fps-allocations', {
    method: 'POST',
    body: JSON.stringify({
      allocationId: `${prefix}-ALLOC`,
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: demoQuantities.fpsAllocationKg,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    })
  });

  const receipt = await request(`/fps-allocations/${prefix}-ALLOC/receipt`, {
    method: 'POST',
    body: JSON.stringify({ receivedQtyKg: demoQuantities.fpsReceiptKg })
  });

  const auth = await request('/auth/mock-otp', {
    method: 'POST',
    body: JSON.stringify({
      authTxnId: `${prefix}-AUTH`,
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: 'MOCK_OTP',
      authResult: 'SUCCESS'
    })
  });

  const distribution = await request('/distributions', {
    method: 'POST',
    body: JSON.stringify({
      distributionId: `${prefix}-DIST`,
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: demoQuantities.citizenDistributionKg,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'FPS-DEALER-101',
      timestamp: '2026-06-30T10:00:00.000Z'
    })
  });

  const summary = await request('/dashboard/summary');
  const trace = await request('/trace/lots/LOT-RICE-2026-001');

  return {
    mode: 'fabric',
    summary,
    allocation,
    receipt,
    auth,
    distribution,
    traceVerificationSource: trace.verificationSource
  };
};

export const runExceptionPathFabric = async ({ apiBase, token }) => {
  if (!token) {
    throw new Error('Fabric demo requires an OIDC service access token');
  }

  const { request } = createFabricClient({ apiBase, token });
  const prefix = `FAB-EXC-${Date.now()}`;

  const health = await request('/health');
  if (!health.ok) throw new Error('API health check failed');

  await request('/transfers', {
    method: 'POST',
    body: JSON.stringify({
      transferId: `${prefix}-TR`,
      lotId: 'LOT-RICE-2026-001',
      fromOrg: 'PROC-001',
      toOrg: 'FCI-001',
      dispatchedQtyKg: demoQuantities.shortReceiptDispatchKg,
      vehicleNo: 'KA01AB3001'
    })
  });

  const transfer = await request(`/transfers/${prefix}-TR/receive`, {
    method: 'POST',
    body: JSON.stringify({ receivedQtyKg: demoQuantities.shortReceiptReceivedKg })
  });

  const alerts = await request('/audit-alerts');
  const shortReceiptAlert = alerts.find((alert) => alert.alertType === 'SHORT_RECEIPT' && alert.entityId === transfer.transferId);

  const allocation = await request('/fps-allocations', {
    method: 'POST',
    body: JSON.stringify({
      allocationId: `${prefix}-ALLOC`,
      fpsId: 'FPS-101',
      commodity: 'Rice',
      allocatedQtyKg: demoQuantities.fpsAllocationKg,
      month: '2026-06',
      sourceGodownId: 'ISSUE-001'
    })
  });

  await request(`/fps-allocations/${prefix}-ALLOC/receipt`, {
    method: 'POST',
    body: JSON.stringify({ receivedQtyKg: demoQuantities.fpsReceiptKg })
  });

  const auth = await request('/auth/mock-otp', {
    method: 'POST',
    body: JSON.stringify({
      authTxnId: `${prefix}-AUTH`,
      beneficiaryRefHash: 'beneficiary-hash',
      rationCardHash: 'demo-ration-card-hash',
      authMode: 'MOCK_OTP',
      authResult: 'SUCCESS'
    })
  });

  const firstDistribution = await request('/distributions', {
    method: 'POST',
    body: JSON.stringify({
      distributionId: `${prefix}-DIST-1`,
      fpsId: 'FPS-101',
      rationCardHash: 'demo-ration-card-hash',
      beneficiaryRefHash: 'beneficiary-hash',
      commodity: 'Rice',
      deliveredKg: demoQuantities.citizenDistributionKg,
      authMode: auth.authMode,
      authResult: auth.authResult,
      authTxnRefHash: auth.authTxnRefHash,
      dealerId: 'FPS-DEALER-101',
      timestamp: '2026-06-30T10:00:00.000Z'
    })
  });

  let duplicateBlocked = false;
  let duplicateClaimAlert;
  try {
    await request('/distributions', {
      method: 'POST',
      body: JSON.stringify({
        distributionId: `${prefix}-DIST-2`,
        fpsId: 'FPS-101',
        rationCardHash: 'demo-ration-card-hash',
        beneficiaryRefHash: 'beneficiary-hash',
        commodity: 'Rice',
        deliveredKg: demoQuantities.citizenDistributionKg,
        authMode: auth.authMode,
        authResult: auth.authResult,
        authTxnRefHash: auth.authTxnRefHash,
        dealerId: 'FPS-DEALER-101',
        timestamp: '2026-06-30T10:05:00.000Z'
      })
    });
  } catch (error) {
    duplicateBlocked = error.status >= 400;
  }

  const refreshedAlerts = await request('/audit-alerts');
  duplicateClaimAlert = refreshedAlerts.find(
    (alert) => alert.alertType === 'DUPLICATE_CLAIM' && alert.entityId === 'demo-ration-card-hash'
  );

  const summary = await request('/dashboard/summary');

  return {
    mode: 'fabric',
    summary,
    transfer,
    shortReceiptAlert,
    allocation,
    firstDistribution,
    duplicateBlocked,
    duplicateClaimAlert,
    alerts: refreshedAlerts
  };
};
