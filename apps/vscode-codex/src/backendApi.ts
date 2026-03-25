import axios from "axios";
import * as vscode from "vscode";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_REASONING,
  type ReasoningEffort,
  type AuthResponse,
  type BillingSummary,
  type Chat,
  type ChatResponse,
  type MessageSendResponse,
  type MessageStreamEvent,
  type MessageResponse,
  type Project,
  type ProjectResponse,
  type SessionResponse
} from "./types.js";

const AUTH_TOKEN_SECRET = "codexBridge.authToken";
const PROVIDER_KEY_SECRET = "codexBridge.providerApiKey";
const DEFAULT_BACKEND_URL = "http://62.109.2.121:3030";

export class BackendApi {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async hasSession() {
    return Boolean(await this.context.secrets.get(AUTH_TOKEN_SECRET));
  }

  async hasProviderKey() {
    return Boolean(await this.context.secrets.get(PROVIDER_KEY_SECRET));
  }

  async register(name: string, email: string, password: string) {
    const client = await this.client({ requireAuth: false });
    const response = await client.post<AuthResponse>("/auth/register", {
      name,
      email,
      password
    });

    return response.data;
  }

  async login(email: string, password: string) {
    const client = await this.client({ requireAuth: false });
    const response = await client.post<AuthResponse>("/auth/login", {
      email,
      password
    });

    return response.data;
  }

  async listProjects() {
    const response = await (await this.client()).get<ProjectResponse>("/api/projects");
    return response.data.items;
  }

  async listChats(projectId: string) {
    const response = await (await this.client()).get<ChatResponse>(`/api/projects/${projectId}/chats`);
    return response.data.items;
  }

  async createProject(name: string, description: string) {
    const response = await (await this.client()).post<Project>("/api/projects", {
      name,
      description
    });

    return response.data;
  }

  async createChat(projectId: string, title: string, model = DEFAULT_CODEX_MODEL, reasoningEffort: ReasoningEffort = DEFAULT_CODEX_REASONING) {
    const response = await (await this.client()).post<Chat>(`/api/projects/${projectId}/chats`, {
      title,
      model,
      reasoningEffort
    });

    return response.data;
  }

  async listMessages(chatId: string) {
    const response = await (await this.client()).get<MessageResponse>(`/api/chats/${chatId}/messages`);
    return response.data.items;
  }

  async sendMessage(chatId: string, content: string, metadata: Record<string, unknown>) {
    const response = await (await this.client({ includeProviderKey: true })).post<MessageSendResponse>(
      `/api/chats/${chatId}/messages`,
      {
        content,
        source: "vscode",
        metadata
      }
    );

    return response.data;
  }

  async *streamMessage(
    chatId: string,
    content: string,
    metadata: Record<string, unknown>,
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<MessageStreamEvent, void, void> {
    const headers = await this.resolveHeaders({
      includeProviderKey: true
    });
    const response = await fetch(`${DEFAULT_BACKEND_URL}/api/chats/${chatId}/messages/stream`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content,
        source: "vscode",
        metadata
      }),
      signal: options?.signal
    });

    if (!response.ok) {
      throw await this.createFetchError(response);
    }

    if (!response.body) {
      throw new Error("The server did not provide a response stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
          continue;
        }

        const event = JSON.parse(trimmed) as
          | MessageStreamEvent
          | { type: "error"; error?: string; code?: string };

        if (event.type === "error") {
          throw new Error(event.error || "The server reported a streaming error.");
        }

        yield event;
      }
    }

    const tail = buffer.trim();

    if (!tail) {
      return;
    }

    const event = JSON.parse(tail) as
      | MessageStreamEvent
      | { type: "error"; error?: string; code?: string };

    if (event.type === "error") {
      throw new Error(event.error || "The server reported a streaming error.");
    }

    yield event;
  }

  async getSession() {
    const response = await (await this.client()).get<SessionResponse>("/api/me");
    return response.data;
  }

  async storeSession(auth: AuthResponse) {
    await this.context.secrets.store(AUTH_TOKEN_SECRET, auth.token);
    await setConfiguration("userEmail", auth.user.email);
  }

  async clearSession() {
    await this.context.secrets.delete(AUTH_TOKEN_SECRET);
    await setConfiguration("userEmail", "");
  }

  async storeProviderKey(apiKey: string) {
    await this.context.secrets.store(PROVIDER_KEY_SECRET, apiKey.trim());
  }

  async clearProviderKey() {
    await this.context.secrets.delete(PROVIDER_KEY_SECRET);
  }

  private async client(options?: { requireAuth?: boolean; includeProviderKey?: boolean }) {
    return axios.create({
      baseURL: DEFAULT_BACKEND_URL,
      headers: await this.resolveHeaders(options),
      timeout: 30000
    });
  }

  private async resolveHeaders(options?: { requireAuth?: boolean; includeProviderKey?: boolean }) {
    const headers: Record<string, string> = {};
    const requireAuth = options?.requireAuth ?? true;

    if (requireAuth) {
      const token = await this.context.secrets.get(AUTH_TOKEN_SECRET);

      if (!token) {
        throw new Error("Sign in to the backend before using Codex Bridge.");
      }

      headers.Authorization = `Bearer ${token}`;
    }

    if (options?.includeProviderKey) {
      const providerApiKey = await this.context.secrets.get(PROVIDER_KEY_SECRET);

      if (!providerApiKey) {
        throw new Error("Configure your model API key in Codex Bridge before sending prompts.");
      }

      headers["X-Provider-Api-Key"] = providerApiKey;
    }

    return headers;
  }

  private async createFetchError(response: Response) {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      try {
        const payload = await response.json() as { error?: string };
        return new Error(payload.error || `The server responded with ${response.status}.`);
      } catch {
        return new Error(`The server responded with ${response.status}.`);
      }
    }

    const text = (await response.text()).trim();
    return new Error(text || `The server responded with ${response.status}.`);
  }
}

export async function setConfiguration(key: string, value: string) {
  await vscode.workspace.getConfiguration("codexBridge").update(
    key,
    value,
    vscode.ConfigurationTarget.Global
  );
}
