const vscode = acquireVsCodeApi();
let state = window.__GPT54_INITIAL_STATE__ || {};
const MODEL_LABEL = window.__GPT54_MODEL_LABEL__ || "GPT-5.3 Codex";
const MODEL_REASONING = window.__GPT54_MODEL_REASONING__ || "medium";
let draft = "";
let contextMode = "none";
let authTab = "login";
let viewMode = "chat";

const app = document.getElementById("app");

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRubles(value) {
  return `${Number(value || 0).toFixed(2)} RUB`;
}

function formatTime(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function resolveModelLabel(model) {
  return state.availableModels?.find((item) => String(item.model).toLowerCase() === String(model || "").toLowerCase())?.label
    || model
    || MODEL_LABEL;
}

function renderModelOptions() {
  return (state.availableModels || []).map((item) => `
    <option value="${escapeHtml(item.model)}" ${item.model === state.selectedModel ? "selected" : ""}>
      ${escapeHtml(item.label)} · ${formatRubles(item.inputRubPer1M)} / ${formatRubles(item.outputRubPer1M)}
    </option>
  `).join("");
}

function renderReasoningOptions() {
  return (state.availableReasoningEfforts || ["low", "medium", "high", "xhigh"]).map((item) => `
    <option value="${escapeHtml(item)}" ${item === state.selectedReasoningEffort ? "selected" : ""}>${escapeHtml(item)}</option>
  `).join("");
}

function isNearBottom() {
  const messages = document.getElementById("messages");
  if (!messages) {
    return true;
  }

  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 72;
}

function scrollToBottom() {
  const messages = document.getElementById("messages");
  if (!messages) {
    return;
  }

  messages.scrollTo({ top: messages.scrollHeight, behavior: "smooth" });
}

function renderNotice() {
  if (!state.statusMessage) {
    return "";
  }

  return `<section class="notice ${state.statusTone || "info"}">${escapeHtml(state.statusMessage)}</section>`;
}

function renderAuth() {
  return `
    <div class="shell">
      ${renderNotice()}
      <section class="auth-shell">
        <div class="auth-card">
          <h1>GPT54 Codex for VS Code</h1>
          <p>Open one tab, sign in once, add your personal API key, and chat with your code without any @-commands.</p>
          <div class="tabs">
            <button type="button" class="${authTab === "login" ? "primary" : ""}" data-tab="login">Sign In</button>
            <button type="button" class="${authTab === "register" ? "primary" : ""}" data-tab="register">Create Account</button>
          </div>
          ${authTab === "login" ? `
            <form class="form-grid" id="loginForm">
              <input id="loginEmail" type="email" placeholder="Email" />
              <input id="loginPassword" type="password" placeholder="Password" />
              <button class="primary" type="submit">Continue</button>
            </form>
          ` : `
            <form class="form-grid" id="registerForm">
              <input id="registerName" type="text" placeholder="Display name" />
              <input id="registerEmail" type="email" placeholder="Email" />
              <input id="registerPassword" type="password" placeholder="Password" />
              <button class="primary" type="submit">Create Account</button>
            </form>
          `}
        </div>
      </section>
    </div>
  `;
}

function renderKeySetup() {
  return `
    <div class="shell">
      ${renderNotice()}
      <section class="auth-shell">
        <div class="auth-card">
          <h1>${escapeHtml(state.user?.name || "GPT Workspace")} is signed in</h1>
          <p>Add your personal model API key once. The backend is already built in, so nothing else needs to be configured.</p>
          <form class="form-grid" id="keyForm" style="margin-top:16px;">
            <input id="providerKey" type="password" placeholder="Paste your model API key" />
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="primary" type="submit">Save API Key</button>
              <button class="ghost" type="button" data-command="logout">Log Out</button>
            </div>
          </form>
        </div>
      </section>
    </div>
  `;
}

function renderMessages() {
  if (!state.messages?.length) {
    return `
      <div class="empty">
        <strong>Start a new coding thread</strong>
        The first prompt creates a hidden backend chat automatically. Use Selection or File when you want GPT54 Codex to see code from the current editor.
      </div>
    `;
  }

  return state.messages.map((message) => `
    <article class="message ${message.role.toLowerCase() === "assistant" ? "assistant" : "user"}">
      <div class="message-head">
        <span class="message-author">${message.role.toLowerCase() === "assistant" ? "GPT54" : "You"}</span>
        <span>${escapeHtml(formatTime(message.createdAt))}</span>
      </div>
      <div class="message-body">${message.contentHtml}</div>
      ${message.isStreaming ? '<div class="spinner" style="margin-top:10px;"><span></span><span></span><span></span></div>' : ""}
    </article>
  `).join("");
}

function renderChat() {
  return `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="brand-title">
            <span class="brand-mark">◎</span>
            <span>GPT54 Codex</span>
          </div>
          <div class="brand-subtitle">${escapeHtml(state.activeChat?.title || "Fresh coding chat")} · ${escapeHtml(state.user?.email || "")}</div>
        </div>
        <div class="topbar-actions">
          <button type="button" data-command="newChat">New Chat</button>
          <button type="button" data-action="key">API Key</button>
          <button type="button" data-command="refresh">Refresh</button>
          <button class="ghost" type="button" data-command="logout">Log Out</button>
        </div>
      </header>
      <section class="chip-row">
        <div class="chip"><strong>${escapeHtml(resolveModelLabel(state.activeChat?.model || state.selectedModel))}</strong><span>${escapeHtml(state.activeChat?.reasoningEffort || state.selectedReasoningEffort || MODEL_REASONING)} reasoning</span></div>
        <div class="chip"><strong>This month</strong><span>${formatRubles(state.billing?.spentRub || 0)} / ${formatRubles(state.billing?.limitRub || 0)}</span></div>
        <div class="chip"><strong>Context</strong><span>${escapeHtml(state.activeEditorLabel || "Open a file to attach code context")}</span></div>
      </section>
      ${renderNotice()}
      <div class="conversation">
        <section class="messages" id="messages">${renderMessages()}</section>
        <section class="composer">
          <div class="composer-row" style="margin-top:0; margin-bottom:10px;">
            <div class="mode-row" style="flex:1; min-width:0;">
              <select id="modelSelect" style="min-width:240px; flex:1;">
                ${renderModelOptions()}
              </select>
              <select id="reasoningSelect" style="min-width:150px;">
                ${renderReasoningOptions()}
              </select>
            </div>
            <div class="composer-hint" style="margin:0;">Changing these starts a new chat on the next send.</div>
          </div>
          <textarea id="prompt" placeholder="Ask a coding question, describe what to build, or continue the thread"></textarea>
          <div class="composer-row">
            <div class="mode-row">
              <button type="button" class="mode-button ${contextMode === "none" ? "active" : ""}" data-context="none">Chat</button>
              <button type="button" class="mode-button ${contextMode === "selection" ? "active" : ""}" data-context="selection" ${state.canUseEditorContext ? "" : "disabled"}>Selection</button>
              <button type="button" class="mode-button ${contextMode === "file" ? "active" : ""}" data-context="file" ${state.canUseEditorContext ? "" : "disabled"}>File</button>
            </div>
            <button id="sendPrompt" class="primary" type="button" ${state.isBusy ? "disabled" : ""}>${state.isBusy ? "Thinking..." : "Send"}</button>
          </div>
          <div class="composer-hint">Press Ctrl+Enter to send. Replies stream live from ${escapeHtml(resolveModelLabel(state.selectedModel))}.</div>
        </section>
      </div>
    </div>
  `;
}

function render() {
  const shouldStickToBottom = isNearBottom() || state.isBusy;
  app.innerHTML = !state.hasSession
    ? renderAuth()
    : (!state.hasProviderKey || viewMode === "key")
      ? renderKeySetup()
      : renderChat();

  const prompt = document.getElementById("prompt");
  if (prompt) {
    prompt.value = draft;
    prompt.addEventListener("input", (event) => {
      draft = event.target.value;
    });
    prompt.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        sendPrompt();
      }
    });
  }

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      authTab = button.getAttribute("data-tab") || "login";
      render();
    });
  });

  document.querySelectorAll("[data-command]").forEach((button) => {
    button.addEventListener("click", () => {
      vscode.postMessage({ type: button.getAttribute("data-command") });
    });
  });

  document.querySelectorAll("[data-action='key']").forEach((button) => {
    button.addEventListener("click", () => {
      viewMode = "key";
      render();
    });
  });

  document.querySelectorAll("[data-context]").forEach((button) => {
    button.addEventListener("click", () => {
      contextMode = button.getAttribute("data-context") || "none";
      render();
    });
  });

  document.getElementById("modelSelect")?.addEventListener("change", (event) => {
    vscode.postMessage({
      type: "updatePreferences",
      model: event.target.value,
      reasoningEffort: document.getElementById("reasoningSelect")?.value || state.selectedReasoningEffort
    });
  });

  document.getElementById("reasoningSelect")?.addEventListener("change", (event) => {
    vscode.postMessage({
      type: "updatePreferences",
      model: document.getElementById("modelSelect")?.value || state.selectedModel,
      reasoningEffort: event.target.value
    });
  });

  document.getElementById("loginForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    vscode.postMessage({
      type: "login",
      email: document.getElementById("loginEmail")?.value || "",
      password: document.getElementById("loginPassword")?.value || ""
    });
  });

  document.getElementById("registerForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    vscode.postMessage({
      type: "register",
      name: document.getElementById("registerName")?.value || "",
      email: document.getElementById("registerEmail")?.value || "",
      password: document.getElementById("registerPassword")?.value || ""
    });
  });

  document.getElementById("keyForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const apiKey = document.getElementById("providerKey")?.value || "";
    vscode.postMessage({ type: "saveKey", apiKey });
    viewMode = "chat";
  });

  document.getElementById("sendPrompt")?.addEventListener("click", () => sendPrompt());

  if (shouldStickToBottom) {
    requestAnimationFrame(() => scrollToBottom());
  }
}

function sendPrompt() {
  const value = draft.trim();
  vscode.postMessage({ type: "sendPrompt", prompt: value, contextMode });
  if (value) {
    draft = "";
  }
}

window.addEventListener("message", (event) => {
  const payload = event.data;
  if (!payload || payload.type !== "snapshot") {
    return;
  }

  state = payload.state;
  if (!state.hasProviderKey) {
    viewMode = "key";
  } else if (viewMode === "key" && state.hasProviderKey) {
    viewMode = "chat";
  }
  render();
});

render();
vscode.postMessage({ type: "ready" });
