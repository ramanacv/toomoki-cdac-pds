export type FabricMetricsSink = {
  recordFabricSubmission(durationSeconds: number, result: 'success' | 'failure'): void;
  recordProofRetry(deadLettered: boolean): void;
};

let sink: FabricMetricsSink | null = null;
export const setFabricMetricsSink = (value: FabricMetricsSink | null): void => { sink = value; };
export const recordFabricSubmissionMetric = (durationSeconds: number, result: 'success' | 'failure'): void =>
  sink?.recordFabricSubmission(durationSeconds, result);
export const recordProofRetryMetric = (deadLettered: boolean): void => sink?.recordProofRetry(deadLettered);
