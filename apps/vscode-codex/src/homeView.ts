import * as vscode from "vscode";
import { BackendApi, setConfiguration } from "./backendApi.js";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_MODEL_LABEL,
  DEFAULT_CODEX_REASONING,
  type AuthResponse,
  type Chat,
  type ChatMessage,
  type ContextMode,
  type Project,
  type SidebarState
} from "./types.js";

const BRIDGE_PROJECT_NAME = "Codex";
const BRIDGE_PROJECT_DESCRIPTION = "Internal workspace used by the VS Code Codex sidebar.";

type WebviewMessage =
  | { type: "login"; email?: string; password?: string }
  | { type: "register"; name?: string; email?: string; password?: string }
  | { type: "saveKey"; apiKey?: string }
  | { type: "sendPrompt"; prompt?: string; contextMode?: ContextMode }
  | { type: "newChat" | "logout" | "refresh" | "sendSelection" };

export class CodexChatProvider implements vscode.WebviewViewProvider {
  private refreshHandler?: () => Promise<void>;
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly api: BackendApi
  ) {}

  setRefreshHandler(handler: () => Promise<void>) {
    this.refreshHandler = handler;
  }

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      void this.handleMessage(message);
    }, undefined, this.context.subscriptions);
    await this.refresh();
  }

  async refresh() {
    if (!this.view) {
      return;
    }

    try {
      const state = await buildSidebarState(this.api);
      this.view.webview.html = renderHtml(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Codex chat.";
      this.view.webview.html = renderErrorHtml(message);
    }
  }

  async startNewChat() {
    if (!(await ensureSignedIn(this.api))) {
      return;
    }

    await setConfiguration("defaultChatId", "");
    await this.afterMutation();
  }

  async logout() {
    await this.api.clearSession();
    await setConfiguration("defaultProjectId", "");
    await setConfiguration("defaultChatId", "");
    await this.afterMutation();
  }

  async sendSelectionToChat() {
    if (!(await ensureSignedIn(this.api)) || !(await ensureProviderKey(this.api))) {
      return;
    }

    const payload = buildPromptPayload("", "selection");
    const chat = await ensureActiveChat(this.api, true, payload.titleSeed);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "Codex is sending the current selection..." },
      () => this.api.sendMessage(chat.id, payload.content, payload.metadata)
    );

    await this.afterMutation();
  }

  private async handleMessage(message: WebviewMessage) {
    try {
      switch (message.type) {
        case "login":
          await this.login(message.email ?? "", message.password ?? "");
          return;
        case "register":
          await this.register(message.name ?? "", message.email ?? "", message.password ?? "");
          return;
        case "saveKey":
          await this.saveKey(message.apiKey ?? "");
          return;
        case "sendPrompt":
          await this.sendPrompt(message.prompt ?? "", message.contextMode ?? "none");
          return;
        case "newChat":
          await this.startNewChat();
          return;
        case "sendSelection":
          await this.sendSelectionToChat();
          return;
        case "logout":
          await this.logout();
          return;
        case "refresh":
          await this.afterMutation();
          return;
        default:
          return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected Codex Bridge failure.";
      if (isProviderNotice(message)) {
        vscode.window.showWarningMessage(message);
      } else {
        vscode.window.showErrorMessage(message);
      }
    }
  }

  private async login(email: string, password: string) {
    if (!email.trim() || !password.trim()) {
      throw new Error("Email and password are required.");
    }

    const auth = await this.api.login(email.trim(), password);
    await applyAuthSession(this.api, auth);
    await this.afterMutation();
  }

  private async register(name: string, email: string, password: string) {
    if (!name.trim() || !email.trim() || !password.trim()) {
      throw new Error("Name, email, and password are required.");
    }

    const auth = await this.api.register(name.trim(), email.trim(), password);
    await applyAuthSession(this.api, auth);
    await this.afterMutation();
  }

  private async saveKey(apiKey: string) {
    if (!apiKey.trim()) {
      throw new Error("The model API key is required.");
    }

    await this.api.storeProviderKey(apiKey.trim());
    await this.afterMutation();
  }

  private async sendPrompt(prompt: string, contextMode: ContextMode) {
    if (!(await ensureSignedIn(this.api)) || !(await ensureProviderKey(this.api))) {
      return;
    }

    const payload = buildPromptPayload(prompt, contextMode);
    const chat = await ensureActiveChat(this.api, true, payload.titleSeed);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "Codex is thinking..." },
      () => this.api.sendMessage(chat.id, payload.content, payload.metadata)
    );

    await this.afterMutation();
  }

  private async afterMutation() {
    if (this.refreshHandler) {
      await this.refreshHandler();
      return;
    }

    await this.refresh();
  }
}

export async function buildSidebarState(api: BackendApi): Promise<SidebarState> {
  const hasSession = await api.hasSession();
  const hasProviderKey = await api.hasProviderKey();
  const editorLabel = getEditorLabel();
  const state: SidebarState = {
    hasSession,
    hasProviderKey,
    messages: [],
    canUseEditorContext: Boolean(vscode.window.activeTextEditor),
    activeEditorLabel: editorLabel
  };

  if (!hasSession) {
    return state;
  }

  const session = await api.getSession();
  const activeProject = await resolveBridgeProject(api, false);
  const activeChat = activeProject ? await resolveActiveChat(api, activeProject, false) : undefined;
  const messages = activeChat ? await api.listMessages(activeChat.id) : [];

  return {
    ...state,
    user: session.user,
    billing: session.billing,
    activeProject,
    activeChat,
    messages
  };
}

export async function updateStatusBar(statusBar: vscode.StatusBarItem, api: BackendApi) {
  const state = await buildSidebarState(api);
  statusBar.command = "workbench.view.extension.codexBridge";

  if (!state.hasSession) {
    statusBar.text = "$(comment-discussion) Codex";
    statusBar.tooltip = "Open Codex and sign in.";
    return;
  }

  if (!state.hasProviderKey) {
    statusBar.text = "$(key) Codex: add key";
    statusBar.tooltip = "Open Codex and save your model API key.";
    return;
  }

  if (state.billing?.isLimitReached) {
    statusBar.text = "$(alert) Codex: limit reached";
    statusBar.tooltip = `${formatRubles(state.billing.spentRub)} / ${formatRubles(state.billing.limitRub)}`;
    return;
  }

  statusBar.text = `$(comment-discussion) ${DEFAULT_CODEX_MODEL_LABEL} · ${formatRubles(state.billing?.spentRub ?? 0)}`;
  statusBar.tooltip = `Chat: ${state.activeChat?.title ?? "New chat"}`;
}

export function formatRubles(value: number) {
  return `${value.toFixed(2)} RUB`;
}

async function applyAuthSession(api: BackendApi, auth: AuthResponse) {
  await api.storeSession(auth);
  await setConfiguration("defaultProjectId", "");
  await setConfiguration("defaultChatId", "");
}

async function ensureActiveChat(api: BackendApi, createIfMissing: boolean, titleSeed: string) {
  const project = await resolveBridgeProject(api, createIfMissing);

  if (!project) {
    throw new Error("Unable to prepare the hidden Codex workspace.");
  }

  const chat = await resolveActiveChat(api, project, createIfMissing, titleSeed);

  if (!chat) {
    throw new Error("Unable to prepare the active Codex chat.");
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
  titleSeed = "New chat"
): Promise<Chat | undefined> {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const chatId = configuration.get<string>("defaultChatId")?.trim();
  const chats = await api.listChats(project.id);
  const configured = chatId ? chats.find((chat) => chat.id === chatId) : undefined;

  if (configured) {
    return configured;
  }

  if (chatId) {
    await setConfiguration("defaultChatId", "");
  }

  if (!createIfMissing) {
    return undefined;
  }

  const chat = await api.createChat(project.id, deriveTitle(titleSeed));
  await setConfiguration("defaultChatId", chat.id);
  return chat;
}

function buildPromptPayload(promptText: string, contextMode: ContextMode) {
  const prompt = promptText.trim();

  if (contextMode === "none") {
    if (!prompt) {
      throw new Error("Write a prompt before sending.");
    }

    return {
      content: prompt,
      metadata: { bridgeModel: DEFAULT_CODEX_MODEL, contextMode },
      titleSeed: prompt
    };
  }

  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    throw new Error("Open a file in the editor before attaching code context.");
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
    "```",
    selectionText,
    "```"
  ].join("\n");

  return {
    content,
    metadata: {
      bridgeModel: DEFAULT_CODEX_MODEL,
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

async function ensureSignedIn(api: BackendApi) {
  if (await api.hasSession()) {
    return true;
  }

  vscode.window.showWarningMessage("Open the Codex panel and sign in first.");
  return false;
}

async function ensureProviderKey(api: BackendApi) {
  if (await api.hasProviderKey()) {
    return true;
  }

  vscode.window.showWarningMessage("Open the Codex panel and add your model API key first.");
  return false;
}

function renderHtml(state: SidebarState) {
  const messages = state.messages.length === 0
    ? `<section class="empty"><h2>Start a focused coding chat</h2><p>The first prompt creates a new chat automatically. Use Selection or File when you want code context from the active editor.</p></section>`
    : state.messages.map(renderMessage).join("");

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <style>
        :root { color-scheme: dark; --bg:#0b1117; --panel:#101821; --panel2:#15212c; --line:rgba(124,145,167,.18); --text:#edf4fb; --muted:#93a9bc; --accent:#10a37f; --accentSoft:rgba(16,163,127,.16); }
        * { box-sizing:border-box; } html,body { height:100%; } body { margin:0; font:13px/1.5 "Segoe UI",system-ui,sans-serif; color:var(--text); background:linear-gradient(180deg,#091018 0%,#0b1117 100%); }
        .shell { min-height:100vh; display:flex; flex-direction:column; gap:12px; padding:14px; }
        .card,.topbar,.composer,.message,.empty { border:1px solid var(--line); border-radius:18px; background:rgba(16,24,33,.96); }
        .topbar { display:flex; justify-content:space-between; gap:10px; align-items:center; padding:12px 14px; }
        .brand strong { display:block; font-size:15px; } .brand span { color:var(--muted); }
        .actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; }
        button,input,textarea { font:inherit; } button { border:1px solid var(--line); background:var(--panel2); color:var(--text); border-radius:12px; padding:8px 11px; cursor:pointer; } button.primary { background:linear-gradient(135deg,#17a77f,#108868); border-color:transparent; color:#fff; } button.ghost { background:transparent; } button:disabled { opacity:.45; cursor:default; }
        .meta { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .card { padding:11px 12px; } .card strong { display:block; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; } .card span { display:block; margin-top:6px; font-size:15px; font-weight:700; }
        .messages { flex:1; min-height:260px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; padding-right:4px; }
        .message { padding:12px 14px; } .message.user { margin-left:18px; background:#123729; } .message.assistant { background:#15212c; }
        .message-head { display:flex; justify-content:space-between; gap:10px; color:var(--muted); font-size:12px; } .message-body { margin-top:8px; white-space:pre-wrap; word-break:break-word; }
        .composer { padding:12px; } textarea { width:100%; min-height:116px; resize:vertical; border:1px solid var(--line); border-radius:14px; background:#0f1720; color:var(--text); padding:12px; outline:none; }
        .composer-bar { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-top:10px; } .pills { display:flex; flex-wrap:wrap; gap:8px; } .pill.active { background:var(--accentSoft); border-color:rgba(16,163,127,.35); }
        .hint { margin-top:10px; color:var(--muted); } .empty { padding:16px; } .empty h2 { margin:0; font-size:17px; } .empty p { margin:8px 0 0; color:var(--muted); }
        .auth h1 { margin:14px 0 8px; font-size:23px; line-height:1.12; } .auth p { color:var(--muted); } .tabs { display:flex; gap:8px; margin:14px 0; } .panel { display:none; } .panel.active { display:block; } form { display:grid; gap:10px; } input { width:100%; border:1px solid var(--line); border-radius:12px; background:#0f1720; color:var(--text); padding:11px 12px; outline:none; }
      </style>
    </head>
    <body>
      <div class="shell">
        ${!state.hasSession ? renderAuth() : !state.hasProviderKey ? renderKeySetup(state) : `
          <header class="topbar">
            <div class="brand"><strong>Codex</strong><span>${escapeHtml(state.user?.email ?? "")}</span></div>
            <div class="actions">
              <button data-command="newChat">New Chat</button>
              <button data-command="sendSelection" ${state.canUseEditorContext ? "" : "disabled"}>Send Selection</button>
              <button data-command="refresh">Refresh</button>
              <button class="ghost" data-command="logout">Log Out</button>
            </div>
          </header>
          <section class="meta">
            <div class="card"><strong>Model</strong><span>${DEFAULT_CODEX_MODEL_LABEL}</span></div>
            <div class="card"><strong>Spent</strong><span>${formatRubles(state.billing?.spentRub ?? 0)}</span></div>
            <div class="card"><strong>Chat</strong><span>${escapeHtml(state.activeChat?.title ?? "New chat")}</span></div>
            <div class="card"><strong>Context</strong><span>${escapeHtml(state.activeEditorLabel ?? "Open a file to attach code context")}</span></div>
          </section>
          <section class="messages" id="messages">${messages}</section>
          <section class="composer">
            <textarea id="prompt" placeholder="Describe what to build, ask a question, or continue the current thread"></textarea>
            <div class="composer-bar">
              <div class="pills">
                <button class="pill active" data-context="none">Chat</button>
                <button class="pill" data-context="selection" ${state.canUseEditorContext ? "" : "disabled"}>Selection</button>
                <button class="pill" data-context="file" ${state.canUseEditorContext ? "" : "disabled"}>File</button>
              </div>
              <button id="sendPrompt" class="primary">Send</button>
            </div>
            <div class="hint">Press Ctrl+Enter to send. Replies use ${DEFAULT_CODEX_MODEL_LABEL} with ${DEFAULT_CODEX_REASONING} reasoning.</div>
          </section>`}
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        let contextMode = "none";
        const prompt = document.getElementById("prompt");
        const setPanel = (name) => {
          document.querySelectorAll("[data-tab]").forEach((button) => button.classList.toggle("primary", button.dataset.tab === name));
          document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
        };
        document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => setPanel(button.dataset.tab)));
        document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => vscode.postMessage({ type: button.dataset.command })));
        document.querySelectorAll("[data-context]").forEach((button) => button.addEventListener("click", () => { contextMode = button.dataset.context; document.querySelectorAll("[data-context]").forEach((chip) => chip.classList.toggle("active", chip === button)); }));
        document.getElementById("loginForm")?.addEventListener("submit", (event) => { event.preventDefault(); vscode.postMessage({ type:"login", email: document.getElementById("loginEmail")?.value || "", password: document.getElementById("loginPassword")?.value || "" }); });
        document.getElementById("registerForm")?.addEventListener("submit", (event) => { event.preventDefault(); vscode.postMessage({ type:"register", name: document.getElementById("registerName")?.value || "", email: document.getElementById("registerEmail")?.value || "", password: document.getElementById("registerPassword")?.value || "" }); });
        document.getElementById("keyForm")?.addEventListener("submit", (event) => { event.preventDefault(); vscode.postMessage({ type:"saveKey", apiKey: document.getElementById("providerKey")?.value || "" }); });
        const send = () => vscode.postMessage({ type:"sendPrompt", prompt: prompt?.value || "", contextMode });
        document.getElementById("sendPrompt")?.addEventListener("click", send);
        prompt?.addEventListener("keydown", (event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); send(); } });
        document.getElementById("messages")?.scrollTo(0, document.getElementById("messages").scrollHeight);
        setPanel("login");
      </script>
    </body>
  </html>`;
}

function renderAuth() {
  return `<section class="card auth">
    <h1>Talk to your code</h1>
    <p>Sign in once, add your personal model key, and this sidebar becomes a simple coding chat.</p>
    <div class="tabs">
      <button class="primary" type="button" data-tab="login">Sign In</button>
      <button type="button" data-tab="register">Create Account</button>
    </div>
    <div class="panel active" data-panel="login">
      <form id="loginForm">
        <input id="loginEmail" type="email" placeholder="Email" />
        <input id="loginPassword" type="password" placeholder="Password" />
        <button class="primary" type="submit">Continue</button>
      </form>
    </div>
    <div class="panel" data-panel="register">
      <form id="registerForm">
        <input id="registerName" type="text" placeholder="Display name" />
        <input id="registerEmail" type="email" placeholder="Email" />
        <input id="registerPassword" type="password" placeholder="Password" />
        <button class="primary" type="submit">Create Account</button>
      </form>
    </div>
  </section>`;
}

function renderKeySetup(state: SidebarState) {
  return `<section class="card auth">
    <h1>${escapeHtml(state.user?.name ?? "Workspace")} is signed in</h1>
    <p>Add your personal model API key once. The backend URL is already built in.</p>
    <form id="keyForm" style="margin-top:14px">
      <input id="providerKey" type="password" placeholder="Paste your model API key" />
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="primary" type="submit">Save API Key</button>
        <button class="ghost" type="button" data-command="logout">Log Out</button>
      </div>
    </form>
  </section>`;
}

function renderMessage(message: ChatMessage) {
  const isAssistant = message.role.toLowerCase() === "assistant";
  return `<article class="message ${isAssistant ? "assistant" : "user"}">
    <div class="message-head"><span>${isAssistant ? "Codex" : "You"}</span><span>${escapeHtml(formatTime(message.createdAt))}</span></div>
    <div class="message-body">${escapeHtml(message.content)}</div>
  </article>`;
}

function deriveTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New chat";
  }

  return normalized.length <= 48 ? normalized : `${normalized.slice(0, 45).trimEnd()}...`;
}

function formatTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function getEditorLabel() {
  const editor = vscode.window.activeTextEditor;
  return editor ? (vscode.workspace.asRelativePath(editor.document.uri, false) || editor.document.fileName) : undefined;
}

function isProviderNotice(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("balance") || lowered.includes("quota") || lowered.includes("api key") || lowered.includes("provider") || lowered.includes("budget") || lowered.includes("limit");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderErrorHtml(message: string) {
  return `<!DOCTYPE html><html lang="en"><body style="margin:0;padding:16px;background:#0b1117;color:#f5f7fa;font:13px/1.5 Segoe UI,system-ui,sans-serif"><div style="padding:18px;border-radius:18px;border:1px solid rgba(255,118,118,.25);background:rgba(31,18,24,.96)"><h1 style="margin:0 0 10px;font-size:18px">Codex chat is temporarily unavailable</h1><p style="margin:0;white-space:pre-wrap;color:#f3b9b9">${escapeHtml(message)}</p></div></body></html>`;
}
