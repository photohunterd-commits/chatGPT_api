export const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";
export const DEFAULT_CODEX_MODEL_LABEL = "GPT-5.3 Codex";
export const DEFAULT_CODEX_REASONING = "medium";
export const REASONING_EFFORT_OPTIONS = ["low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORT_OPTIONS)[number];
export type ContextMode = "none" | "selection" | "file";

export interface SupportedModelPricing {
  model: string;
  label: string;
  inputRubPer1M: number;
  cachedInputRubPer1M: number;
  outputRubPer1M: number;
  webSearchRubPerCall: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface BillingSummary {
  periodMonth: string;
  currency: string;
  limitRub: number;
  spentRub: number;
  remainingRub: number;
  isLimitReached: boolean;
  maxOutputTokens: number;
  requestCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  supportedModels: SupportedModelPricing[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  chatCount: number;
  lastMessageAt: string | null;
}

export interface Chat {
  id: string;
  projectId: string;
  title: string;
  model: string;
  reasoningEffort: string;
  lastMessageAt: string | null;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: string;
  content: string;
  source: string;
  createdAt: string;
}

export interface ProjectResponse {
  items: Project[];
}

export interface ChatResponse {
  items: Chat[];
}

export interface MessageResponse {
  chat: Chat;
  items: ChatMessage[];
}

export interface SessionResponse {
  user: User;
  billing: BillingSummary;
}

export interface MessageSendResponse {
  billing: BillingSummary;
  userMessage?: ChatMessage;
  assistantMessage?: ChatMessage;
}

export interface MessageStreamStartEvent {
  type: "start";
  userMessage?: ChatMessage;
}

export interface MessageStreamDeltaEvent {
  type: "delta";
  delta: string;
}

export interface MessageStreamDoneEvent {
  type: "done";
  billing: BillingSummary;
  assistantMessage?: ChatMessage;
}

export type MessageStreamEvent =
  | MessageStreamStartEvent
  | MessageStreamDeltaEvent
  | MessageStreamDoneEvent;

export interface SidebarState {
  hasSession: boolean;
  hasProviderKey: boolean;
  user?: User;
  billing?: BillingSummary;
  activeProject?: Project;
  activeChat?: Chat;
  messages: ChatMessage[];
  canUseEditorContext: boolean;
  activeEditorLabel?: string;
}
