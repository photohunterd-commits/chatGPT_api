import { AppApiError } from "./errors.js";

export interface ModelPricing {
  model: string;
  label: string;
  inputRubPer1M: number;
  cachedInputRubPer1M: number;
  outputRubPer1M: number;
  webSearchRubPerCall: number;
}

export interface UsageBreakdown {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
}

export interface UsageCostBreakdown extends UsageBreakdown {
  cachedInputCostRub: number;
  inputCostRub: number;
  outputCostRub: number;
  pricing: ModelPricing;
  totalCostRub: number;
  uncachedInputTokens: number;
  webSearchCostRub: number;
}

const modelPricingTable: ModelPricing[] = [
  {
    model: "gpt-5.4",
    label: "GPT-5.4",
    inputRubPer1M: 480,
    cachedInputRubPer1M: 48,
    outputRubPer1M: 2880,
    webSearchRubPerCall: 1.92
  },
  {
    model: "gpt-5-mini",
    label: "GPT-5 mini",
    inputRubPer1M: 48,
    cachedInputRubPer1M: 4.8,
    outputRubPer1M: 384,
    webSearchRubPerCall: 1.92
  }
];

export function getSupportedModelPricing() {
  return [...modelPricingTable];
}

export function resolveModelPricing(model: string) {
  const normalizedModel = normalizeModel(model);

  return (
    modelPricingTable.find((entry) => entry.model === normalizedModel)
    ?? modelPricingTable.find((entry) => normalizedModel.startsWith(`${entry.model}-`))
    ?? null
  );
}

export function calculateUsageCost(model: string, usage: UsageBreakdown): UsageCostBreakdown {
  const pricing = resolveModelPricing(model);

  if (!pricing) {
    throw new AppApiError(
      `Model pricing is not configured on this server for "${model}". Add pricing before using this model.`,
      400,
      "model_pricing_missing"
    );
  }

  const inputTokens = clampNumber(usage.inputTokens);
  const cachedInputTokens = Math.min(clampNumber(usage.cachedInputTokens), inputTokens);
  const outputTokens = clampNumber(usage.outputTokens);
  const webSearchCalls = clampNumber(usage.webSearchCalls);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens);

  const inputCostRub = toRubles((uncachedInputTokens / 1_000_000) * pricing.inputRubPer1M);
  const cachedInputCostRub = toRubles((cachedInputTokens / 1_000_000) * pricing.cachedInputRubPer1M);
  const outputCostRub = toRubles((outputTokens / 1_000_000) * pricing.outputRubPer1M);
  const webSearchCostRub = toRubles(webSearchCalls * pricing.webSearchRubPerCall);
  const totalCostRub = toRubles(inputCostRub + cachedInputCostRub + outputCostRub + webSearchCostRub);

  return {
    pricing,
    inputTokens,
    cachedInputTokens,
    uncachedInputTokens,
    outputTokens,
    webSearchCalls,
    inputCostRub,
    cachedInputCostRub,
    outputCostRub,
    webSearchCostRub,
    totalCostRub
  };
}

function normalizeModel(value: string) {
  return value.trim().toLowerCase();
}

function clampNumber(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function toRubles(value: number) {
  return Number(value.toFixed(6));
}
