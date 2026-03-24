export const DEFAULT_CODEX_MODEL = "gpt-5-mini";
export const DEFAULT_CODEX_MODEL_LABEL = "GPT-5 mini";
export const DEFAULT_CODEX_REASONING = "medium";

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

export interface ProjectResponse {
  items: Project[];
}

export interface ChatResponse {
  items: Chat[];
}

export interface SessionResponse {
  user: User;
  billing: BillingSummary;
}

export interface MessageSendResponse {
  billing: BillingSummary;
}

export interface HomeState {
  hasSession: boolean;
  hasProviderKey: boolean;
  user?: User;
  billing?: BillingSummary;
  projects: Project[];
  chats: Chat[];
  activeProject?: Project;
  activeChat?: Chat;
}
