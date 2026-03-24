import * as vscode from "vscode";
import { BackendApi } from "./backendApi.js";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_MODEL_LABEL,
  DEFAULT_CODEX_REASONING,
  type HomeState
} from "./types.js";

export class CodexHomeProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly api: BackendApi
  ) {}

  async resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.onDidReceiveMessage(async (message: { command?: string }) => {
      if (!message.command) {
        return;
      }

      await vscode.commands.executeCommand(message.command);
    }, undefined, this.context.subscriptions);

    await this.refresh();
  }

  async refresh() {
    if (!this.view) {
      return;
    }

    try {
      const state = await buildHomeState(this.api);
      this.view.webview.html = renderHomeHtml(this.view.webview, state);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load Codex overview.";
      this.view.webview.html = renderErrorHtml(this.view.webview, message);
    }
  }
}

export async function buildHomeState(api: BackendApi): Promise<HomeState> {
  const hasSession = await api.hasSession();
  const hasProviderKey = await api.hasProviderKey();

  if (!hasSession) {
    return {
      hasSession,
      hasProviderKey,
      projects: [],
      chats: []
    };
  }

  const session = await api.getSession();
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const projectId = configuration.get<string>("defaultProjectId")?.trim();
  const chatId = configuration.get<string>("defaultChatId")?.trim();
  const projects = await api.listProjects();
  const activeProject = projectId
    ? projects.find((project) => project.id === projectId) ?? projects[0]
    : projects[0];
  const chats = activeProject ? await api.listChats(activeProject.id) : [];
  const activeChat = chatId
    ? chats.find((chat) => chat.id === chatId) ?? chats[0]
    : chats[0];

  return {
    hasSession,
    hasProviderKey,
    user: session.user,
    billing: session.billing,
    projects,
    chats,
    activeProject,
    activeChat
  };
}

export async function updateStatusBar(statusBar: vscode.StatusBarItem, api: BackendApi) {
  const state = await buildHomeState(api);

  if (!state.hasSession) {
    statusBar.command = "codexBridge.login";
    statusBar.text = "$(account) Codex Sign In";
    statusBar.tooltip = "Sign in to the private GPT workspace backend.";
    return;
  }

  if (!state.hasProviderKey) {
    statusBar.command = "codexBridge.configureProviderKey";
    statusBar.text = "$(key) Add Model Key";
    statusBar.tooltip = "Store your personal model API key in VS Code Secret Storage.";
    return;
  }

  if (state.billing?.isLimitReached) {
    statusBar.command = "codexBridge.refresh";
    statusBar.text = "$(alert) Monthly limit reached";
    statusBar.tooltip = [
      `User: ${state.user?.email ?? "signed in"}`,
      `Spent: ${formatRubles(state.billing.spentRub)} / ${formatRubles(state.billing.limitRub)}`,
      `Period: ${state.billing.periodMonth}`
    ].join("\n");
    return;
  }

  statusBar.command = "codexBridge.pickChat";
  statusBar.text = `$(comment-discussion) ${DEFAULT_CODEX_MODEL_LABEL} · ${formatRubles(state.billing?.spentRub ?? 0)}`;
  statusBar.tooltip = [
    `User: ${state.user?.email ?? "signed in"}`,
    `Spend: ${formatRubles(state.billing?.spentRub ?? 0)} / ${formatRubles(state.billing?.limitRub ?? 0)}`,
    state.activeProject ? `Project: ${state.activeProject.name}` : "Project: not selected",
    state.activeChat ? `Chat: ${state.activeChat.title}` : "Chat: not selected"
  ].join("\n");
}

export function formatRubles(value: number) {
  return `${value.toFixed(2)} RUB`;
}

function renderHomeHtml(webview: vscode.Webview, state: HomeState) {
  const nonce = getNonce();
  const tone = state.billing?.isLimitReached
    ? "danger"
    : (state.billing?.spentRub ?? 0) >= (state.billing?.limitRub ?? Number.MAX_SAFE_INTEGER) * 0.8
      ? "warn"
      : "good";

  return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
        />
        <style>
          body { margin: 0; padding: 16px; color: #f2f7fb; font: 13px/1.45 "Segoe UI", system-ui, sans-serif; background:
            radial-gradient(circle at top right, rgba(86,212,163,.14), transparent 34%),
            radial-gradient(circle at bottom left, rgba(64,144,255,.12), transparent 28%),
            linear-gradient(180deg, #091018 0%, #0c141d 45%, #0a1118 100%); }
          .hero, .card, .row, .note { border: 1px solid rgba(112,132,153,.18); border-radius: 20px; background: rgba(18,28,39,.92); }
          .hero { padding: 18px; box-shadow: 0 22px 60px rgba(0,0,0,.35); }
          .eyebrow { display:inline-block; padding:6px 10px; border-radius:999px; background: rgba(86,212,163,.14); color:#56d4a3; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
          h1 { margin: 14px 0 8px; font-size: 27px; line-height: 1.1; letter-spacing: -.03em; }
          p { margin: 0; color: #94a8bd; }
          .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
          button { border:1px solid rgba(112,132,153,.18); border-radius:14px; padding:10px 14px; background:#182534; color:#f2f7fb; cursor:pointer; font:inherit; }
          button.primary { background: linear-gradient(135deg, #1c9c76, #118f67); border-color: transparent; }
          button:disabled { opacity:.45; cursor:default; }
          .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; margin-top:14px; }
          .card, .row, .note { padding:15px; }
          .label { color:#94a8bd; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
          .metric { display:block; margin-top:10px; font-size:22px; font-weight:700; letter-spacing:-.03em; color:${tone === "good" ? "#56d4a3" : tone === "warn" ? "#f3b155" : "#ff7676"}; }
          .subtle { margin-top:6px; color:#94a8bd; }
          .section { margin: 18px 0 8px; color:#94a8bd; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
          .list { display:grid; gap:10px; }
          .row strong { display:block; }
          .row span { display:block; margin-top:4px; color:#94a8bd; }
          .note { margin-top:18px; background: rgba(15,23,31,.88); color:#94a8bd; }
        </style>
      </head>
      <body>
        <section class="hero">
          <div class="eyebrow">Codex Bridge</div>
          <h1>Lean coding workspace inside VS Code</h1>
          <p>${state.hasSession ? escapeHtml(state.user?.name ?? "Workspace") + " is signed in" : "Sign in to connect your private workspace"}</p>
          <p style="margin-top:8px;">Default model here: ${DEFAULT_CODEX_MODEL_LABEL}. Desktop app stays on GPT-5.4.</p>
          <div class="actions">
            ${state.hasSession ? `
              <button class="primary" data-command="codexBridge.sendSelection" ${state.hasProviderKey && state.activeChat ? "" : "disabled"}>Send Selection</button>
              <button data-command="codexBridge.createProject">New Project</button>
              <button data-command="codexBridge.createChat" ${state.activeProject ? "" : "disabled"}>New Chat</button>
              <button data-command="codexBridge.pickProject" ${state.projects.length > 0 ? "" : "disabled"}>Pick Project</button>
              <button data-command="codexBridge.pickChat" ${state.chats.length > 0 ? "" : "disabled"}>Pick Chat</button>
              <button data-command="codexBridge.configureProviderKey">API Key</button>
              <button data-command="codexBridge.refresh">Refresh</button>
              <button data-command="codexBridge.logout">Log Out</button>
            ` : `
              <button class="primary" data-command="codexBridge.login">Sign In</button>
              <button data-command="codexBridge.register">Create Account</button>
            `}
          </div>
        </section>

        <div class="grid">
          <section class="card">
            <span class="label">Monthly Spend</span>
            <strong class="metric">${formatRubles(state.billing?.spentRub ?? 0)}</strong>
            <div class="subtle">${state.billing?.isLimitReached ? "Monthly server budget is exhausted for this user." : `Budget resets monthly. Limit: ${formatRubles(state.billing?.limitRub ?? 0)}.`}</div>
          </section>
          <section class="card">
            <span class="label">Remaining</span>
            <strong class="metric">${formatRubles(state.billing?.remainingRub ?? 0)}</strong>
            <div class="subtle">${escapeHtml(state.billing?.periodMonth ?? "Not loaded")}</div>
          </section>
          <section class="card">
            <span class="label">Active Project</span>
            <strong class="metric" style="font-size:18px">${escapeHtml(state.activeProject?.name ?? "Not selected")}</strong>
            <div class="subtle">${state.projects.length} project(s)</div>
          </section>
          <section class="card">
            <span class="label">Active Chat</span>
            <strong class="metric" style="font-size:18px">${escapeHtml(state.activeChat?.title ?? "Not selected")}</strong>
            <div class="subtle">${escapeHtml(state.activeChat?.model ?? DEFAULT_CODEX_MODEL)} / ${escapeHtml(state.activeChat?.reasoningEffort ?? DEFAULT_CODEX_REASONING)}</div>
          </section>
        </div>

        <div class="section">Workspace Snapshot</div>
        <div class="list">
          <div class="row">
            <strong>${escapeHtml(state.user?.email ?? "No active user")}</strong>
            <span>${state.hasProviderKey ? "Provider key is stored locally in VS Code Secret Storage." : "Provider key is still missing."}</span>
          </div>
          <div class="row">
            <strong>${state.billing?.requestCount ?? 0} model request(s) this month</strong>
            <span>Output cap per response: ${state.billing?.maxOutputTokens ?? 0} tokens</span>
          </div>
          <div class="row">
            <strong>${escapeHtml(state.activeProject?.name ?? "Project not selected")}</strong>
            <span>${escapeHtml(state.activeChat?.title ?? "Chat not selected")}</span>
          </div>
        </div>

        <div class="note">
          This bridge uses <code>${DEFAULT_CODEX_MODEL}</code> by default because it is much cheaper than GPT-5.4 on AITUNNEL while still staying strong for focused coding prompts. Server-side accounting remains per user and per month.
        </div>

        <script nonce="${nonce}">
          const vscode = acquireVsCodeApi();
          document.querySelectorAll("[data-command]").forEach((button) => {
            button.addEventListener("click", () => {
              if (button.disabled) return;
              vscode.postMessage({ command: button.getAttribute("data-command") });
            });
          });
        </script>
      </body>
    </html>
  `;
}

function renderErrorHtml(webview: vscode.Webview, message: string) {
  const nonce = getNonce();

  return /* html */ `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';" />
        <style>
          body { margin: 0; padding: 18px; color: #f5f7fa; font: 13px/1.5 "Segoe UI", system-ui, sans-serif; background: linear-gradient(180deg, #0c1218 0%, #0a1015 100%); }
          .card { padding: 18px; border-radius: 18px; border: 1px solid rgba(255,118,118,.25); background: rgba(31,18,24,.96); }
          h1 { margin: 0 0 10px; font-size: 18px; }
          p { margin: 0; color: #f3b9b9; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Codex overview is temporarily unavailable</h1>
          <p>${escapeHtml(message)}</p>
        </div>
      </body>
    </html>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getNonce() {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let value = "";

  for (let index = 0; index < 24; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return value;
}
