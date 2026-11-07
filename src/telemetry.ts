type Usage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cached_input_tokens?: number;
  audio_input_tokens?: number;
  requests?: number;
} | { audio_seconds: number };

type Operation = 'agent_run' | 'agent_action' | 'vision_label' | 'vision_dish' | 'vision_pack' | 'transcription';

export function estimateModelCost(model: string, usage: Usage | null): number | null {
  if (!usage) return null;
  if (model === 'gpt-4o-mini-transcribe' || model === 'gpt-4o-mini-transcribe-2025-12-15') {
    return 'audio_seconds' in usage
      ? usage.audio_seconds * 0.003 / 60
      : (usage.input_tokens * 1.25 + usage.output_tokens * 5) / 1e6;
  }
  if (!('input_tokens' in usage)) return null;
  if (model === 'gpt-4.1-mini' || model === 'gpt-4.1-mini-2025-04-14') {
    const cached = usage.cached_input_tokens ?? 0;
    return ((usage.input_tokens - cached) * 0.4 + cached * 0.1 + usage.output_tokens * 1.6) / 1e6;
  }
  return null;
}

export async function observeModel<T>(
  operation: Operation,
  configuredModel: string,
  call: () => Promise<T>,
  metrics: (result: T) => { model?: string; usage: Usage | null },
): Promise<T> {
  const start = performance.now();
  let model = configuredModel;
  let outcome = 'error';
  let usage: Usage | null = null;
  try {
    const result = await call();
    outcome = 'success';
    const reported = metrics(result);
    model = reported.model ?? configuredModel;
    usage = reported.usage;
    return result;
  } finally {
    console.info(JSON.stringify({
      event: 'model_telemetry', operation, model, outcome,
      latency_ms: Math.round(performance.now() - start),
      usage, estimated_cost_usd: estimateModelCost(model, usage),
    }));
  }
}
