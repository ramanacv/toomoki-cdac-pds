import { describe, expect, it } from 'vitest';
import { runDemoSmoke, runExceptionDemo, runHappyPathDemo } from '../src/demo-scripts.js';

describe('demo scripts', () => {
  it('runs the happy-path demo flow', async () => {
    const result = await runHappyPathDemo();

    expect(result.summary.completedDistributions).toBeGreaterThan(0);
    expect(result.distribution.distributionId).toBe('DIST-DEMO-001');
    expect(result.alerts).toHaveLength(0);
  });

  it('runs the exception-path demo flow', async () => {
    const result = await runExceptionDemo();

    expect(result.alert.alertType).toBe('SHORT_RECEIPT');
    expect(result.summary.openAlerts).toBeGreaterThan(0);
  });

  it('runs the combined smoke flow', async () => {
    const result = await runDemoSmoke();

    expect(result.happy.summary.completedDistributions).toBeGreaterThan(0);
    expect(result.exception.alert.alertType).toBe('SHORT_RECEIPT');
  });
});
