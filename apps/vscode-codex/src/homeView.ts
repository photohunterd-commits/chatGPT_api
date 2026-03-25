import hljs from "highlight.js";
import MarkdownIt from "markdown-it";
import * as vscode from "vscode";
import { BackendApi, setConfiguration } from "./backendApi.js";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_MODEL_LABEL,
  DEFAULT_CODEX_REASONING,
  REASONING_EFFORT_OPTIONS,
  type AuthResponse,
  type BillingSummary,
  type Chat,
  type ChatMessage,
  type ContextMode,
  type Project,
  type ReasoningEffort,
  type SupportedModelPricing,
  type User
} from "./types.js";

const BRIDGE_PROJECT_NAME = "Codex";
const BRIDGE_PROJECT_DESCRIPTION = "Internal workspace used by the VS Code GPT54 Codex chat tab.";
const PRIMARY_VIEW_ID = "photohunterd.gpt54Codex.sidebar";
const SECONDARY_VIEW_ID = "photohunterd.gpt54Codex.chat";

function escapeHtmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight(code, language): string {
    const normalizedLanguage = language.trim().toLowerCase();

    try {
      const highlighted = normalizedLanguage && hljs.getLanguage(normalizedLanguage)
        ? hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value
        : hljs.highlightAuto(code).value;
      const label = escapeHtmlText(normalizedLanguage || "code");

      return [
        `<div class="code-shell">`,
        `<div class="code-label">${label}</div>`,
        `<pre><code class="hljs language-${label}">${highlighted}</code></pre>`,
        `</div>`
      ].join("");
    } catch {
      return [
        `<div class="code-shell">`,
        `<div class="code-label">${escapeHtmlText(normalizedLanguage || "code")}</div>`,
        `<pre><code class="hljs">${escapeHtmlText(code)}</code></pre>`,
        `</div>`
      ].join("");
    }
  }
});

interface PanelMessage {
  id: string;
  role: string;
  createdAt: string;
  content: string;
  contentHtml: string;
  isStreaming?: boolean;
}

interface PanelState {
  hasSession: boolean;
  hasProviderKey: boolean;
  user?: User;
  billing?: BillingSummary;
  activeChat?: Chat;
  messages: PanelMessage[];
  canUseEditorContext: boolean;
  activeEditorLabel?: string;
  selectedModel: string;
  selectedReasoningEffort: ReasoningEffort;
  availableModels: SupportedModelPricing[];
  availableReasoningEfforts: ReasoningEffort[];
  isBusy: boolean;
  statusMessage?: string;
  statusTone?: "info" | "warning" | "error";
}

type WebviewMessage =
  | { type: "ready" | "logout" | "refresh" | "newChat" }
  | { type: "login"; email?: string; password?: string }
  | { type: "register"; name?: string; email?: string; password?: string }
  | { type: "saveKey"; apiKey?: string }
  | { type: "updatePreferences"; model?: string; reasoningEffort?: ReasoningEffort }
  | { type: "sendPrompt"; prompt?: string; contextMode?: ContextMode };

export class CodexSidebarController implements vscode.WebviewViewProvider {
  private readonly views = new Map<string, vscode.WebviewView>();
  private isBusy = false;
  private statusMessage = "";
  private statusTone: PanelState["statusTone"] = "info";
  private lastState?: PanelState;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly api: BackendApi
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    const viewId = webviewView.viewType;
    this.views.set(viewId, webviewView);
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "assets")]
    };
    webviewView.webview.html = renderHtml(webviewView.webview, this.context.extensionUri);
    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(message);
    }, undefined, this.context.subscriptions);
    webviewView.onDidDispose(() => {
      this.views.delete(viewId);
    });
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        void this.pushSnapshot();
      }
    });

    await this.pushSnapshot();
  }

  async reveal(preferredViewId?: string) {
    const preferredView = preferredViewId ? this.views.get(preferredViewId) : undefined;
    const visibleView = [...this.views.values()].find((view) => view.visible);
    const fallbackView = preferredView ?? visibleView ?? this.views.get(PRIMARY_VIEW_ID) ?? this.views.get(SECONDARY_VIEW_ID);
    fallbackView?.show?.(true);
    await this.pushSnapshot();
  }

  async refresh() {
    await this.pushSnapshot();
  }

  async startNewChat() {
    await setConfiguration("defaultChatId", "");
    this.setStatus("Started a fresh GPT54 Codex chat.", "info");
    await this.pushSnapshot();
  }

  async logout() {
    await this.api.clearSession();
    await setConfiguration("defaultProjectId", "");
    await setConfiguration("defaultChatId", "");
    this.setStatus("Signed out from GPT Workspace.", "info");
    await this.pushSnapshot();
  }

  async sendSelectionToChat() {
    await this.sendPrompt("", "selection");
  }

  async promptLogin() {
    const email = await vscode.window.showInputBox({
      title: "GPT54 Codex",
      prompt: "Enter your account email",
      placeHolder: "you@example.com",
      ignoreFocusOut: true
    });

    if (!email?.trim()) {
      return;
    }

    const password = await vscode.window.showInputBox({
      title: "GPT54 Codex",
      prompt: "Enter your password",
      password: true,
      ignoreFocusOut: true
    });

    if (!password) {
      return;
    }

    await this.login(email.trim(), password);
  }

  async promptRegister() {
    const name = await vscode.window.showInputBox({
      title: "GPT54 Codex",
      prompt: "Display name",
      placeHolder: "Alex",
      ignoreFocusOut: true
    });

    if (!name?.trim()) {
      return;
    }

    const email = await vscode.window.showInputBox({
      title: "GPT54 Codex",
      prompt: "Email",
      placeHolder: "you@example.com",
      ignoreFocusOut: true
    });

    if (!email?.trim()) {
      return;
    }

    const password = await vscode.window.showInputBox({
      title: "GPT54 Codex",
      prompt: "Create a password",
      password: true,
      ignoreFocusOut: true
    });

    if (!password) {
      return;
    }

    await this.register(name.trim(), email.trim(), password);
  }

  async promptProviderKey() {
    const apiKey = await vscode.window.showInputBox({
      title: "GPT54 Codex",
      prompt: "Paste your personal model API key",
      password: true,
      ignoreFocusOut: true
    });

    if (!apiKey?.trim()) {
      return;
    }

    await this.saveKey(apiKey.trim());
  }

  private async handleMessage(message: WebviewMessage) {
    try {
      switch (message.type) {
        case "ready":
        case "refresh":
          await this.pushSnapshot();
          return;
        case "login":
          if ((message.email ?? "").trim() || (message.password ?? "").trim()) {
            await this.login(message.email ?? "", message.password ?? "");
          } else {
            await this.promptLogin();
          }
          return;
        case "register":
          if ((message.name ?? "").trim() || (message.email ?? "").trim() || (message.password ?? "").trim()) {
            await this.register(message.name ?? "", message.email ?? "", message.password ?? "");
          } else {
            await this.promptRegister();
          }
          return;
        case "saveKey":
          if ((message.apiKey ?? "").trim()) {
            await this.saveKey(message.apiKey ?? "");
          } else {
            await this.promptProviderKey();
          }
          return;
        case "updatePreferences":
          await this.updatePreferences(message.model, message.reasoningEffort);
          return;
        case "sendPrompt":
          await this.sendPrompt(message.prompt ?? "", message.contextMode ?? "none");
          return;
        case "newChat":
          await this.startNewChat();
          return;
        case "logout":
          await this.logout();
          return;
        default:
          return;
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unexpected GPT54 Codex failure.";
      this.setStatus(messageText, isProviderNotice(messageText) ? "warning" : "error");
      await this.pushSnapshot();

      if (isProviderNotice(messageText)) {
        vscode.window.showWarningMessage(messageText);
      } else {
        vscode.window.showErrorMessage(messageText);
      }
    }
  }

  private async login(email: string, password: string) {
    if (!email.trim() || !password.trim()) {
      throw new Error("Email and password are required.");
    }

    const auth = await this.api.login(email.trim(), password);
    await applyAuthSession(this.api, auth);
    this.setStatus(`Signed in as ${auth.user.email}.`, "info");
    await this.pushSnapshot();
  }

  private async register(name: string, email: string, password: string) {
    if (!name.trim() || !email.trim() || !password.trim()) {
      throw new Error("Name, email, and password are required.");
    }

    const auth = await this.api.register(name.trim(), email.trim(), password);
    await applyAuthSession(this.api, auth);
    this.setStatus(`Account created for ${auth.user.email}.`, "info");
    await this.pushSnapshot();
  }

  private async saveKey(apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("The model API key is required.");
    }

    await this.api.storeProviderKey(apiKey.trim());
    this.setStatus("Model API key saved locally in VS Code.", "info");
    await this.pushSnapshot();
  }

  private async updatePreferences(model?: string, reasoningEffort?: ReasoningEffort) {
    if (model?.trim()) {
      await setConfiguration("selectedModel", model.trim());
    }

    if (reasoningEffort) {
      await setConfiguration("selectedReasoningEffort", reasoningEffort);
    }

    this.setStatus("The next chat will use the selected model and reasoning depth.", "info");
    await this.pushSnapshot();
  }

  private async sendPrompt(prompt: string, contextMode: ContextMode) {
    if (!(await this.api.hasSession())) {
      this.setStatus("Sign in to GPT Workspace first.", "warning");
      await this.pushSnapshot();
      return;
    }

    if (!(await this.api.hasProviderKey())) {
      this.setStatus("Add your personal model API key to continue.", "warning");
      await this.pushSnapshot();
      return;
    }

    let state = await buildPanelState(this.api, {
      isBusy: true,
      statusMessage: this.statusMessage,
      statusTone: this.statusTone
    });
    const payload = buildPromptPayload(prompt, contextMode, state.selectedModel, state.selectedReasoningEffort);
    const chat = await ensureActiveChat(
      this.api,
      true,
      payload.titleSeed,
      state.selectedModel,
      state.selectedReasoningEffort,
      state.activeChat
    );

    this.isBusy = true;
    this.setStatus(`Sending request to ${resolveModelLabel(chat.model, state.availableModels)}...`, "info");
    state = {
      ...state,
      activeChat: chat,
      messages: state.activeChat?.id === chat.id ? state.messages : [],
      isBusy: true,
      statusMessage: this.statusMessage,
      statusTone: this.statusTone
    };

    const optimisticUserMessage: PanelMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      createdAt: new Date().toISOString(),
      content: payload.metadata.contextMode === "none" ? prompt.trim() : payload.titleSeed,
      contentHtml: renderMarkdown(payload.metadata.contextMode === "none" ? prompt.trim() : prompt.trim() || payload.titleSeed)
    };
    const streamingMessageId = `streaming-${Date.now()}`;
    let streamingMessage: PanelMessage = {
      id: streamingMessageId,
      role: "assistant",
      createdAt: new Date().toISOString(),
      content: "",
      contentHtml: renderMarkdown(""),
      isStreaming: true
    };
    state.messages = [...state.messages, optimisticUserMessage, streamingMessage];
    await this.postSnapshot(state);

    try {
      for await (const event of this.api.streamMessage(chat.id, payload.content, payload.metadata)) {
        if (event.type === "start") {
          this.setStatus(`Streaming reply from ${resolveModelLabel(chat.model, state.availableModels)}...`, "info");
          state.statusMessage = this.statusMessage;
          state.statusTone = this.statusTone;

          if (event.userMessage) {
            state.messages = replaceMessage(state.messages, toPanelMessage(event.userMessage), optimisticUserMessage.id);
          }

          await this.postSnapshot(state);
          continue;
        }

        if (event.type === "delta") {
          const nextContent = `${streamingMessage.content}${event.delta}`;
          streamingMessage = {
            ...streamingMessage,
            content: nextContent,
            contentHtml: renderMarkdown(nextContent),
            isStreaming: true
          };
          state.messages = replaceMessage(state.messages, streamingMessage);
          await this.postSnapshot(state);
          continue;
        }

        if (event.type === "done") {
          if (event.assistantMessage) {
            state.messages = replaceMessage(state.messages, toPanelMessage(event.assistantMessage), streamingMessageId);
          } else {
            state.messages = replaceMessage(state.messages, {
              ...streamingMessage,
              isStreaming: false
            });
          }

          state.billing = event.billing;
          this.setStatus(
            `This month: ${formatRubles(event.billing.spentRub)} / ${formatRubles(event.billing.limitRub)}.`,
            event.billing.isLimitReached ? "warning" : "info"
          );
          state.isBusy = false;
          state.statusMessage = this.statusMessage;
          state.statusTone = this.statusTone;
          await this.postSnapshot(state);
        }
      }
    } finally {
      this.isBusy = false;
    }

    await this.pushSnapshot();
  }

  private setStatus(message: string, tone: PanelState["statusTone"]) {
    this.statusMessage = message;
    this.statusTone = tone;
  }

  private async pushSnapshot() {
    const state = await buildPanelState(this.api, {
      isBusy: this.isBusy,
      statusMessage: this.statusMessage,
      statusTone: this.statusTone
    });
    await this.postSnapshot(state);
  }

  private async postSnapshot(state: PanelState) {
    this.lastState = state;

    const targetViews = [...this.views.values()].filter((view) => view.visible);

    if (targetViews.length === 0) {
      return;
    }

    await Promise.all(targetViews.map((view) => view.webview.postMessage({
      type: "snapshot",
      state
    })));
  }
}

export async function updateStatusBar(statusBar: vscode.StatusBarItem, api: BackendApi) {
  statusBar.command = "codexBridge.openChat";

  if (!(await api.hasSession())) {
    statusBar.text = "$(comment-discussion) GPT54 Codex";
    statusBar.tooltip = "Open the GPT54 Codex tab.";
    return;
  }

  if (!(await api.hasProviderKey())) {
    statusBar.text = "$(key) GPT54 Codex";
    statusBar.tooltip = "Open GPT54 Codex and add your personal model API key.";
    return;
  }

  try {
    const session = await api.getSession();
    const selectedModel = await getSelectedModel(session.billing.supportedModels);
    statusBar.text = `$(comment-discussion) ${DEFAULT_CODEX_MODEL_LABEL} · ${formatRubles(session.billing.spentRub)}`;
    statusBar.tooltip = `This month: ${formatRubles(session.billing.spentRub)} / ${formatRubles(session.billing.limitRub)}.`;
  } catch {
    statusBar.text = "$(comment-discussion) GPT54 Codex";
    statusBar.tooltip = "Open the GPT54 Codex tab.";
  }
}

async function buildPanelState(
  api: BackendApi,
  options?: {
    isBusy?: boolean;
    statusMessage?: string;
    statusTone?: PanelState["statusTone"];
  }
): Promise<PanelState> {
  const hasSession = await api.hasSession();
  const hasProviderKey = await api.hasProviderKey();
  const selectedModel = await getSelectedModel();
  const selectedReasoningEffort = await getSelectedReasoningEffort();
  const baseState: PanelState = {
    hasSession,
    hasProviderKey,
    messages: [],
    canUseEditorContext: Boolean(vscode.window.activeTextEditor),
    activeEditorLabel: getEditorLabel(),
    selectedModel,
    selectedReasoningEffort,
    availableModels: getSelectableCodexModels(),
    availableReasoningEfforts: [...REASONING_EFFORT_OPTIONS],
    isBusy: options?.isBusy ?? false,
    statusMessage: options?.statusMessage,
    statusTone: options?.statusTone ?? "info"
  };

  if (!hasSession) {
    return baseState;
  }

  try {
    const session = await api.getSession();
    const availableModels = filterSelectableModels(session.billing.supportedModels);
    const resolvedSelectedModel = await getSelectedModel(availableModels);
    const activeProject = await resolveBridgeProject(api, false);
    const activeChat = activeProject
      ? await resolveActiveChat(api, activeProject, false, "New chat", resolvedSelectedModel, selectedReasoningEffort)
      : undefined;
    const messages = activeChat ? await api.listMessages(activeChat.id) : [];

    return {
      ...baseState,
      user: session.user,
      billing: session.billing,
      selectedModel: resolvedSelectedModel,
      availableModels,
      activeChat,
      messages: messages.map(toPanelMessage)
    };
  } catch {
    return baseState;
  }
}

async function applyAuthSession(api: BackendApi, auth: AuthResponse) {
  await api.storeSession(auth);
  await setConfiguration("defaultProjectId", "");
  await setConfiguration("defaultChatId", "");
}

async function ensureActiveChat(
  api: BackendApi,
  createIfMissing: boolean,
  titleSeed: string,
  selectedModel: string,
  selectedReasoningEffort: ReasoningEffort,
  currentChat?: Chat
) {
  const project = await resolveBridgeProject(api, createIfMissing);

  if (!project) {
    throw new Error("Unable to prepare the hidden GPT54 Codex workspace.");
  }

  const chat = await resolveActiveChat(
    api,
    project,
    createIfMissing,
    titleSeed,
    selectedModel,
    selectedReasoningEffort,
    currentChat
  );

  if (!chat) {
    throw new Error("Unable to prepare the active GPT54 Codex chat.");
  }

  return chat;
}

async function resolveBridgeProject(api: BackendApi, createIfMissing: boolean): Promise<Project | undefined> {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const projectId = configuration.get<string>("defaultProjectId")?.trim();
  const projects = await api.listProjects();
  const configured = projectId ? projects.find((project) => project.id === projectId) : undefined;
  const hidden = projects.find((project) => project.description === BRIDGE_PROJECT_DESCRIPTION);
  const resolved = configured ?? hidden;

  if (resolved) {
    await setConfiguration("defaultProjectId", resolved.id);
    return resolved;
  }

  if (!createIfMissing) {
    return undefined;
  }

  const project = await api.createProject(BRIDGE_PROJECT_NAME, BRIDGE_PROJECT_DESCRIPTION);
  await setConfiguration("defaultProjectId", project.id);
  return project;
}

async function resolveActiveChat(
  api: BackendApi,
  project: Project,
  createIfMissing: boolean,
  titleSeed = "New chat",
  selectedModel = DEFAULT_CODEX_MODEL,
  selectedReasoningEffort: ReasoningEffort = DEFAULT_CODEX_REASONING,
  currentChat?: Chat
): Promise<Chat | undefined> {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const chatId = configuration.get<string>("defaultChatId")?.trim();
  const chats = await api.listChats(project.id);
  const configured = chatId ? chats.find((chat) => chat.id === chatId) : undefined;
  const resolvedCurrentChat = currentChat && currentChat.projectId === project.id
    ? chats.find((chat) => chat.id === currentChat.id) ?? currentChat
    : undefined;
  const activeChat = configured ?? resolvedCurrentChat;

  if (activeChat) {
    const matchesSelectedModel = normalizeModel(activeChat.model) === normalizeModel(selectedModel);
    const matchesSelectedReasoning = activeChat.reasoningEffort === selectedReasoningEffort;

    if (matchesSelectedModel && matchesSelectedReasoning) {
      return activeChat;
    }

    if (!createIfMissing) {
      return activeChat;
    }

    await setConfiguration("defaultChatId", "");
  }

  if (chatId) {
    await setConfiguration("defaultChatId", "");
  }

  if (!createIfMissing) {
    return undefined;
  }

  const chat = await api.createChat(project.id, deriveTitle(titleSeed), selectedModel, selectedReasoningEffort);
  await setConfiguration("defaultChatId", chat.id);
  return chat;
}

function getSelectableCodexModels() {
  return filterSelectableModels([]);
}

function filterSelectableModels(models: SupportedModelPricing[]) {
  const preferredOrder = [
    "gpt-5.4",
    "gpt-5.3-codex",
    "gpt-5.2-codex",
    "gpt-5.1-codex",
    "gpt-5.1-codex-max",
    "gpt-5.1-codex-mini"
  ];
  const modelMap = new Map(models.map((item) => [normalizeModel(item.model), item]));

  if (modelMap.size === 0) {
    return [
      { model: "gpt-5.4", label: "GPT-5.4", inputRubPer1M: 480, cachedInputRubPer1M: 48, outputRubPer1M: 2880, webSearchRubPerCall: 1.92 },
      { model: "gpt-5.3-codex", label: "GPT-5.3 Codex", inputRubPer1M: 336, cachedInputRubPer1M: 33.6, outputRubPer1M: 2688, webSearchRubPerCall: 1.92 },
      { model: "gpt-5.2-codex", label: "GPT-5.2 Codex", inputRubPer1M: 336, cachedInputRubPer1M: 33.6, outputRubPer1M: 2688, webSearchRubPerCall: 1.92 },
      { model: "gpt-5.1-codex", label: "GPT-5.1 Codex", inputRubPer1M: 240, cachedInputRubPer1M: 24, outputRubPer1M: 1920, webSearchRubPerCall: 1.92 },
      { model: "gpt-5.1-codex-max", label: "GPT-5.1 Codex Max", inputRubPer1M: 240, cachedInputRubPer1M: 24, outputRubPer1M: 1920, webSearchRubPerCall: 1.92 },
      { model: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex mini", inputRubPer1M: 288, cachedInputRubPer1M: 28.8, outputRubPer1M: 1152, webSearchRubPerCall: 1.92 }
    ];
  }

  return preferredOrder
    .map((model) => modelMap.get(model))
    .filter((item): item is SupportedModelPricing => Boolean(item));
}

async function getSelectedModel(models = getSelectableCodexModels()) {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const configuredModel = configuration.get<string>("selectedModel")?.trim();

  if (configuredModel && models.some((item) => normalizeModel(item.model) === normalizeModel(configuredModel))) {
    return configuredModel;
  }

  const fallback = models.find((item) => normalizeModel(item.model) === normalizeModel(DEFAULT_CODEX_MODEL)) ?? models[0];
  return fallback?.model ?? DEFAULT_CODEX_MODEL;
}

async function getSelectedReasoningEffort() {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const configuredReasoning = configuration.get<string>("selectedReasoningEffort")?.trim().toLowerCase();

  return REASONING_EFFORT_OPTIONS.find((item) => item === configuredReasoning) ?? DEFAULT_CODEX_REASONING;
}

function resolveModelLabel(model: string, supportedModels: SupportedModelPricing[]) {
  return supportedModels.find((item) => normalizeModel(item.model) === normalizeModel(model))?.label
    ?? filterSelectableModels(supportedModels).find((item) => normalizeModel(item.model) === normalizeModel(model))?.label
    ?? model;
}

function normalizeModel(value: string) {
  return value.trim().toLowerCase();
}

function buildPromptPayload(
  promptText: string,
  contextMode: ContextMode,
  selectedModel = DEFAULT_CODEX_MODEL,
  selectedReasoningEffort: ReasoningEffort = DEFAULT_CODEX_REASONING
) {
  const prompt = promptText.trim();

  if (contextMode === "none") {
    if (!prompt) {
      throw new Error("Write a prompt before sending.");
    }

    return {
      content: prompt,
      metadata: {
        bridgeModel: selectedModel,
        bridgeReasoningEffort: selectedReasoningEffort,
        contextMode
      },
      titleSeed: prompt
    };
  }

  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("Open a file in VS Code before attaching code context.");
  }

  const selection = editor.selection;
  const selectionText = contextMode === "file" || selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(selection);

  if (!selectionText.trim()) {
    throw new Error("The current editor selection is empty.");
  }

  const usesFullFile = contextMode === "file" || selection.isEmpty;
  const content = [
    prompt || (usesFullFile ? "Help me with this file." : "Help me with this code selection."),
    "",
    `File: ${editor.document.uri.fsPath || editor.document.fileName}`,
    `Language: ${editor.document.languageId}`,
    usesFullFile ? "Selection: full file" : `Selection: lines ${selection.start.line + 1}-${selection.end.line + 1}`,
    "",
    `\`\`\`${editor.document.languageId}`,
    selectionText,
    "```"
  ].join("\n");

  return {
    content,
    metadata: {
      bridgeModel: selectedModel,
      bridgeReasoningEffort: selectedReasoningEffort,
      contextMode,
      filePath: editor.document.uri.fsPath || editor.document.fileName,
      language: editor.document.languageId,
      selectionStartLine: selection.start.line + 1,
      selectionEndLine: selection.end.line + 1,
      selectionEmpty: selection.isEmpty,
      usedFullFile: usesFullFile
    },
    titleSeed: prompt || editor.document.fileName || "New chat"
  };
}

function toPanelMessage(message: ChatMessage): PanelMessage {
  return {
    id: message.id,
    role: message.role,
    createdAt: message.createdAt,
    content: message.content,
    contentHtml: renderMarkdown(message.content)
  };
}

function replaceMessage(messages: PanelMessage[], nextMessage: PanelMessage, fallbackId?: string) {
  const matchId = fallbackId ?? nextMessage.id;
  const index = messages.findIndex((message) => message.id === matchId || message.id === nextMessage.id);

  if (index === -1) {
    return [...messages, nextMessage];
  }

  return messages.map((message, currentIndex) => currentIndex === index ? nextMessage : message);
}

function renderMarkdown(content: string) {
  return markdown.render(normalizeStreamingMarkdown(content));
}

function normalizeStreamingMarkdown(content: string) {
  const fenceMatches = content.match(/(^|\r?\n)```/gm) ?? [];

  return fenceMatches.length % 2 === 1
    ? `${content}\n\`\`\``
    : content;
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri) {
  const initialState = serializeForWebview({
    hasSession: false,
    hasProviderKey: false,
    messages: [],
    canUseEditorContext: false,
    selectedModel: DEFAULT_CODEX_MODEL,
    selectedReasoningEffort: DEFAULT_CODEX_REASONING,
    availableModels: getSelectableCodexModels(),
    availableReasoningEfforts: [...REASONING_EFFORT_OPTIONS],
    isBusy: false,
    statusTone: "info"
  } satisfies PanelState);
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "assets", "webview.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "assets", "webview.css"));

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <link rel="stylesheet" href="${styleUri}" />
    </head>
    <body>
      <div id="app"></div>
      <script>
        window.__GPT54_INITIAL_STATE__ = ${initialState};
        window.__GPT54_MODEL_LABEL__ = ${serializeForWebview(DEFAULT_CODEX_MODEL_LABEL)};
        window.__GPT54_MODEL_REASONING__ = ${serializeForWebview(DEFAULT_CODEX_REASONING)};
      </script>
      <script src="${scriptUri}"></script>
    </body>
  </html>`;
}

function serializeForWebview(value: unknown) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

const WEBVIEW_CSS = String.raw`
  :root {
    color-scheme: dark;
    --bg: #0a0f14;
    --panel: #101720;
    --panel-2: #131c26;
    --panel-3: #0c131b;
    --line: rgba(131, 150, 168, 0.18);
    --line-strong: rgba(47, 209, 172, 0.35);
    --text: #eef5fb;
    --muted: #8fa3b7;
    --accent: #11a37f;
    --accent-2: #14c49a;
    --warning: #f7b955;
    --error: #ff7f7f;
  }

  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0;
    background:
      radial-gradient(circle at top, rgba(20, 196, 154, 0.12), transparent 28%),
      linear-gradient(180deg, #091018 0%, var(--bg) 100%);
    color: var(--text);
    font: 13px/1.5 "Segoe UI", system-ui, sans-serif;
    overflow: hidden;
  }

  button, input, textarea, select { font: inherit; }
  button {
    border: 1px solid var(--line);
    background: var(--panel-2);
    color: var(--text);
    border-radius: 12px;
    padding: 9px 12px;
    cursor: pointer;
    transition: border-color .18s ease, background .18s ease, transform .18s ease;
  }

  button:hover:not(:disabled) {
    border-color: var(--line-strong);
    background: #182230;
    transform: translateY(-1px);
  }

  button:disabled {
    opacity: .45;
    cursor: default;
    transform: none;
  }

  button.primary {
    background: linear-gradient(135deg, var(--accent), #11876b);
    border-color: transparent;
    color: white;
  }

  button.ghost { background: transparent; }

  input, textarea, select {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel-3);
    color: var(--text);
    padding: 12px 14px;
    outline: none;
  }

  textarea {
    min-height: 120px;
    resize: vertical;
  }

  input:focus, textarea:focus, select:focus { border-color: var(--line-strong); }
  a { color: #77d8ff; }

  .shell {
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
  }

  .topbar,
  .notice,
  .auth-card,
  .composer,
  .message {
    border: 1px solid var(--line);
    border-radius: 18px;
    background: rgba(16, 23, 32, 0.95);
    backdrop-filter: blur(10px);
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
  }

  .brand { min-width: 0; }

  .brand-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 700;
  }

  .brand-mark {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(17,163,127,.28), rgba(20,196,154,.1));
    border: 1px solid rgba(20,196,154,.26);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-2);
    font-size: 16px;
  }

  .brand-subtitle {
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .topbar-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: rgba(19, 28, 38, 0.96);
    padding: 8px 12px;
    color: var(--muted);
  }

  .chip strong {
    color: var(--text);
    font-weight: 600;
  }

  .notice {
    padding: 10px 12px;
    color: var(--text);
  }

  .notice.info { border-color: rgba(20,196,154,.25); }
  .notice.warning { border-color: rgba(247,185,85,.28); color: #ffe0a5; }
  .notice.error { border-color: rgba(255,127,127,.28); color: #ffc6c6; }

  .conversation {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: 8px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .message { padding: 14px 16px; }
  .message.assistant { background: rgba(17, 26, 36, 0.96); }
  .message.user { background: rgba(16, 54, 40, 0.96); }

  .message-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    color: var(--muted);
    font-size: 12px;
  }

  .message-author {
    font-weight: 700;
    color: var(--text);
  }

  .message-body {
    margin-top: 10px;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .message-body > :first-child { margin-top: 0; }
  .message-body > :last-child { margin-bottom: 0; }
  .message-body p { margin: 0 0 12px; }
  .message-body ul, .message-body ol { margin: 0 0 12px 18px; padding: 0; }
  .message-body li { margin: 4px 0; }
  .message-body h1, .message-body h2, .message-body h3 { margin: 16px 0 10px; line-height: 1.22; }
  .message-body h1 { font-size: 20px; }
  .message-body h2 { font-size: 17px; }
  .message-body h3 { font-size: 15px; }
  .message-body code {
    font-family: Consolas, "Cascadia Code", "SFMono-Regular", monospace;
    font-size: .93em;
  }
  .message-body p code,
  .message-body li code {
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.08);
    border-radius: 8px;
    padding: 2px 6px;
  }
  .message-body blockquote {
    margin: 0 0 12px;
    padding: 0 0 0 14px;
    border-left: 3px solid rgba(20,196,154,.38);
    color: #bfd1e2;
  }

  .code-shell {
    margin: 12px 0;
    border: 1px solid rgba(124,145,167,.18);
    border-radius: 14px;
    overflow: hidden;
    background: #0a1016;
  }

  .code-label {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(124,145,167,.14);
    background: rgba(19, 28, 38, 0.98);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .08em;
    font-size: 11px;
    font-weight: 700;
  }

  .code-shell pre {
    margin: 0;
    padding: 14px;
    overflow-x: auto;
    background: transparent;
  }

  .composer { padding: 12px; }

  .composer-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }

  .mode-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .mode-button.active {
    background: rgba(17,163,127,.16);
    border-color: rgba(20,196,154,.32);
  }

  .composer-hint {
    margin-top: 10px;
    color: var(--muted);
  }

  .auth-shell {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .auth-card {
    width: min(560px, 100%);
    padding: 22px;
  }

  .auth-card h1 {
    margin: 0 0 10px;
    font-size: 24px;
    line-height: 1.18;
  }

  .auth-card p {
    margin: 0;
    color: var(--muted);
  }

  .tabs {
    display: flex;
    gap: 8px;
    margin: 16px 0;
  }

  .form-grid {
    display: grid;
    gap: 10px;
  }

  .empty {
    padding: 20px;
    border: 1px dashed rgba(124,145,167,.18);
    border-radius: 18px;
    background: rgba(16, 23, 32, 0.55);
    color: var(--muted);
  }

  .empty strong {
    display: block;
    margin-bottom: 6px;
    color: var(--text);
    font-size: 16px;
  }

  .spinner {
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }

  .spinner span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent-2);
    display: inline-block;
    animation: pulse 1s infinite ease-in-out;
  }

  .spinner span:nth-child(2) { animation-delay: .15s; }
  .spinner span:nth-child(3) { animation-delay: .3s; }

  @keyframes pulse {
    0%, 100% { opacity: .22; transform: scale(.8); }
    50% { opacity: 1; transform: scale(1); }
  }

  .messages::-webkit-scrollbar,
  .code-shell pre::-webkit-scrollbar {
    width: 10px;
    height: 10px;
  }

  .messages::-webkit-scrollbar-track,
  .code-shell pre::-webkit-scrollbar-track {
    background: rgba(255,255,255,.04);
    border-radius: 999px;
  }

  .messages::-webkit-scrollbar-thumb,
  .code-shell pre::-webkit-scrollbar-thumb {
    background: rgba(124,145,167,.34);
    border-radius: 999px;
    border: 2px solid transparent;
    background-clip: content-box;
  }

  .messages::-webkit-scrollbar-thumb:hover,
  .code-shell pre::-webkit-scrollbar-thumb:hover {
    background: rgba(124,145,167,.48);
    background-clip: content-box;
  }

  .hljs-keyword,
  .hljs-selector-tag,
  .hljs-literal,
  .hljs-title,
  .hljs-section,
  .hljs-doctag,
  .hljs-type,
  .hljs-name,
  .hljs-strong {
    color: #ff7ab6;
  }

  .hljs-string,
  .hljs-attr,
  .hljs-symbol,
  .hljs-bullet,
  .hljs-addition,
  .hljs-template-tag,
  .hljs-template-variable {
    color: #9ece6a;
  }

  .hljs-number,
  .hljs-regexp,
  .hljs-link {
    color: #ff9e64;
  }

  .hljs-comment,
  .hljs-quote,
  .hljs-deletion {
    color: #7a8ca1;
  }

  .hljs-built_in,
  .hljs-code,
  .hljs-title.class_,
  .hljs-class .hljs-title {
    color: #7dcfff;
  }

  .hljs-variable,
  .hljs-params,
  .hljs-property {
    color: #c0caf5;
  }

  .hljs-function .hljs-title,
  .hljs-title.function_ {
    color: #7aa2f7;
  }
`;

function deriveTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "New chat";
  }

  return normalized.length <= 48
    ? normalized
    : `${normalized.slice(0, 45).trimEnd()}...`;
}

function getEditorLabel() {
  const editor = vscode.window.activeTextEditor;
  return editor ? (vscode.workspace.asRelativePath(editor.document.uri, false) || editor.document.fileName) : undefined;
}

function formatRubles(value: number) {
  return `${value.toFixed(2)} RUB`;
}

function escapeHtml(value: string) {
  return escapeHtmlText(value);
}

function isProviderNotice(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("balance")
    || lowered.includes("quota")
    || lowered.includes("api key")
    || lowered.includes("provider")
    || lowered.includes("budget")
    || lowered.includes("limit")
    || lowered.includes("pricing");
}
