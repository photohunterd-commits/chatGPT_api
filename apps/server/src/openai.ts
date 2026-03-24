import OpenAI from "openai";
import { config, type ReasoningEffort } from "./config.js";

export class ProviderApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string
  ) {
    super(message);
    this.name = "ProviderApiError";
  }
}

interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ModelUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
}

export async function generateAssistantReply(input: {
  apiKey?: string;
  instructions?: string;
  messages: ModelMessage[];
  model: string;
  reasoningEffort: ReasoningEffort;
}) {
  const apiKey = input.apiKey?.trim() || config.openAiApiKey?.trim();

  if (!apiKey) {
    throw new ProviderApiError(
      "Model API key is missing. Enter your provider key in the client settings first.",
      400,
      "provider_key_missing"
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: config.openAiBaseUrl
  });

  try {
    const response = await client.responses.create({
      model: input.model,
      instructions: input.instructions || undefined,
      max_output_tokens: config.openAiMaxOutputTokens,
      reasoning: {
        effort: input.reasoningEffort
      },
      input: input.messages.map((message) => ({
        role: message.role,
        content: message.content
      })),
      store: false
    });

    const text = response.output_text?.trim() || extractText(response.output);

    if (!text) {
      throw new ProviderApiError(
        "The model provider returned an empty response. Check the API key or provider status.",
        502,
        "provider_empty_response"
      );
    }

    const usage = extractUsage(response.usage, response.output);

    return {
      text,
      usage
    };
  } catch (error) {
    throw normalizeProviderError(error);
  }
}

function normalizeProviderError(error: unknown) {
  if (error instanceof ProviderApiError) {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const status = Number((error as { status?: number }).status ?? 0);
    const message =
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "The model provider failed to process the request.";

    if (status === 401 || status === 403) {
      return new ProviderApiError(
        "The model API key is invalid, expired, or not allowed for this model.",
        402,
        "provider_key_invalid"
      );
    }

    if (status === 402 || status === 429) {
      return new ProviderApiError(
        "The model API key cannot be used right now. Most likely the balance or quota is exhausted.",
        402,
        "provider_quota_exceeded"
      );
    }

    if (status >= 500) {
      return new ProviderApiError(
        "The model provider is temporarily unavailable. Please try again later.",
        503,
        "provider_unavailable"
      );
    }

    return new ProviderApiError(message, 502, "provider_request_failed");
  }

  return new ProviderApiError(
    "The model provider did not return a usable response. Check the API key, balance, or provider status.",
    502,
    "provider_request_failed"
  );
}

function extractText(output: unknown): string {
  if (!Array.isArray(output)) {
    return "";
  }

  const fragments: string[] = [];

  for (const item of output) {
    const content = (item as { content?: Array<{ text?: string }> }).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (typeof part.text === "string" && part.text.trim()) {
        fragments.push(part.text.trim());
      }
    }
  }

  return fragments.join("\n\n").trim();
}

function extractUsage(rawUsage: unknown, output: unknown): ModelUsage {
  if (typeof rawUsage !== "object" || rawUsage === null) {
    throw new ProviderApiError(
      "The model provider did not return usage data required for billing.",
      502,
      "provider_usage_missing"
    );
  }

  const usage = rawUsage as {
    input_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens?: number;
  };

  return {
    inputTokens: clampUsageNumber(usage.input_tokens),
    cachedInputTokens: clampUsageNumber(usage.input_tokens_details?.cached_tokens),
    outputTokens: clampUsageNumber(usage.output_tokens),
    webSearchCalls: countWebSearchCalls(output)
  };
}

function countWebSearchCalls(output: unknown) {
  if (!Array.isArray(output)) {
    return 0;
  }

  const identifiers = new Set<string>();

  for (const item of output) {
    if (typeof item !== "object" || item === null) {
      continue;
    }

    const candidate = item as { id?: unknown; status?: unknown; type?: unknown };

    if (candidate.type !== "web_search_call" || candidate.status === "failed") {
      continue;
    }

    if (typeof candidate.id === "string" && candidate.id.trim()) {
      identifiers.add(candidate.id);
    }
  }

  return identifiers.size;
}

function clampUsageNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}
