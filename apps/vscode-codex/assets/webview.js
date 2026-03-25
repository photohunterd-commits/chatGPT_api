const vscode = acquireVsCodeApi();
let state = window.__GPT54_INITIAL_STATE__ || {};
let draft = "";
let contextMode = "none";
let authTab = "login";
let showKeyForm = false;

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
    || "GPT-5.3 Codex";
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

  return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
}

function scrollToBottom(behavior = "smooth") {
  const messages = document.getElementById("messages");
  if (!messages) {
    return;
  }

  messages.scrollTo({ top: messages.scrollHeight, behavior });
}

function renderNotice() {
  if (!state.statusMessage) {
    return "";
  }

  return `<div class="notice ${state.statusTone || "info"}">${escapeHtml(state.statusMessage)}</div>`;
}

function renderAuth() {
  return `
    <div class="auth-shell">
      ${renderNotice()}
      <div class="auth-card">
        <div class="auth-title">GPT54 Codex</div>
        <div class="auth-subtitle">Sign in once, save your personal API key, and use the chat from this sidebar.</div>
        <div class="auth-tabs">
          <button type="button" class="tab-button ${authTab === "login" ? "active" : ""}" data-tab="login">Sign In</button>
          <button type="button" class="tab-button ${authTab === "register" ? "active" : ""}" data-tab="register">Create Account</button>
        </div>
        ${authTab === "login" ? `
          <form class="form-grid" id="loginForm">
            <input id="loginEmail" type="email" placeholder="Email" />
            <input id="loginPassword" type="password" placeholder="Password" />
            <button class="primary-button" type="submit">Continue</button>
          </form>
        ` : `
          <form class="form-grid" id="registerForm">
            <input id="registerName" type="text" placeholder="Display name" />
            <input id="registerEmail" type="email" placeholder="Email" />
            <input id="registerPassword" type="password" placeholder="Password" />
            <button class="primary-button" type="submit">Create Account</button>
          </form>
        `}
      </div>
    </div>
  `;
}

function renderKeySetup() {
  return `
    <div class="auth-shell">
      ${renderNotice()}
      <div class="auth-card">
        <div class="auth-title">${escapeHtml(state.user?.name || "GPT Workspace")}</div>
        <div class="auth-subtitle">Save your personal API key. The backend is already built in.</div>
        <form class="form-grid" id="keyForm">
          <input id="providerKey" type="password" placeholder="Paste your model API key" />
          <div class="button-row">
            <button class="primary-button" type="submit">Save API Key</button>
            <button class="secondary-button" type="button" data-command="logout">Log Out</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderMessages() {
  if (!state.messages?.length) {
    return `
      <div class="empty-state">
        <div class="empty-title">Start a new coding thread</div>
        <div class="empty-copy">Write a prompt below. The first send creates a hidden backend chat automatically.</div>
      </div>
    `;
  }

  return state.messages.map((message) => `
    <article class="message ${message.role.toLowerCase() === "assistant" ? "assistant" : "user"}">
      <div class="message-meta">
        <span class="message-author">${message.role.toLowerCase() === "assistant" ? "GPT54" : "You"}</span>
        <span class="message-time">${escapeHtml(formatTime(message.createdAt))}</span>
      </div>
      <div class="message-body">${message.contentHtml}</div>
      ${message.isStreaming ? '<div class="typing-row"><span></span><span></span><span></span></div>' : ""}
    </article>
  `).join("");
}

function renderSummaryBar() {
  return `
    <div class="summary-row">
      <div class="summary-main">
        <div class="summary-title">${escapeHtml(state.activeChat?.title || "New chat")}</div>
        <div class="summary-subtitle">${escapeHtml(state.user?.email || "")}</div>
      </div>
      <div class="summary-actions">
        <button class="icon-button" type="button" data-command="newChat">New Chat</button>
        <button class="icon-button" type="button" data-action="toggle-key">${showKeyForm ? "Hide Key" : "API Key"}</button>
        <button class="icon-button" type="button" data-command="refresh">Refresh</button>
        <button class="icon-button" type="button" data-command="logout">Log Out</button>
      </div>
    </div>
  `;
}

function renderInlineKeyForm() {
  if (!showKeyForm) {
    return "";
  }

  return `
    <form class="inline-key-form" id="keyForm">
      <input id="providerKey" type="password" placeholder="Update model API key" />
      <button class="primary-button" type="submit">Save</button>
    </form>
  `;
}

function renderChat() {
  return `
    <div class="chat-shell">
      ${renderSummaryBar()}
      ${renderInlineKeyForm()}
      <div class="info-row">
        <div class="info-chip">${escapeHtml(resolveModelLabel(state.activeChat?.model || state.selectedModel))}</div>
        <div class="info-chip">${escapeHtml(state.activeChat?.reasoningEffort || state.selectedReasoningEffort || "medium")} reasoning</div>
        <div class="info-chip">${formatRubles(state.billing?.spentRub || 0)} / ${formatRubles(state.billing?.limitRub || 0)}</div>
      </div>
      ${renderNotice()}
      <section class="messages" id="messages">${renderMessages()}</section>
      <section class="composer">
        <div class="composer-top">
          <select id="modelSelect">${renderModelOptions()}</select>
          <select id="reasoningSelect">${renderReasoningOptions()}</select>
        </div>
        <textarea id="prompt" placeholder="Ask a coding question, describe what to build, or continue the thread"></textarea>
        <div class="composer-bottom">
          <div class="composer-left">
            <button type="button" class="mode-button ${contextMode === "none" ? "active" : ""}" data-context="none">Chat</button>
            <button type="button" class="mode-button ${contextMode === "selection" ? "active" : ""}" data-context="selection" ${state.canUseEditorContext ? "" : "disabled"}>Selection</button>
            <button type="button" class="mode-button ${contextMode === "file" ? "active" : ""}" data-context="file" ${state.canUseEditorContext ? "" : "disabled"}>File</button>
            <span class="composer-hint">${escapeHtml(state.activeEditorLabel || "Open a file to attach code context")}</span>
          </div>
          <button id="sendPrompt" class="send-button" type="button" ${state.isBusy ? "disabled" : ""}>${state.isBusy ? "Thinking..." : "Send"}</button>
        </div>
      </section>
    </div>
  `;
}

function render() {
  const shouldStickToBottom = isNearBottom() || state.isBusy;

  if (!state.hasSession) {
    app.innerHTML = renderAuth();
  } else if (!state.hasProviderKey) {
    app.innerHTML = renderKeySetup();
  } else {
    app.innerHTML = renderChat();
  }

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

  document.querySelectorAll("[data-action='toggle-key']").forEach((button) => {
    button.addEventListener("click", () => {
      showKeyForm = !showKeyForm;
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
    showKeyForm = false;
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
    showKeyForm = true;
  }
  render();
});

render();
vscode.postMessage({ type: "ready" });
