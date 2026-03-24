import * as vscode from "vscode";
import { BackendApi, setConfiguration } from "./backendApi.js";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_MODEL_LABEL,
  DEFAULT_CODEX_REASONING,
  type AuthResponse,
  type BillingSummary,
  type Chat,
  type Project
} from "./types.js";

export const CHAT_PARTICIPANT_ID = "photohunterd.codexBridge.chat";
export const CHAT_PARTICIPANT_NAME = "gpt54";

const BRIDGE_PROJECT_NAME = "Codex";
const BRIDGE_PROJECT_DESCRIPTION = "Internal workspace used by the VS Code Codex chat participant.";
const CHAT_OPEN_COMMANDS = [
  "workbench.action.chat.open",
  "workbench.panel.chat.view.copilot.focus",
  "github.copilot.chat.focus"
];
const CHAT_NEW_COMMANDS = [
  "workbench.action.chat.newChat"
];

interface ParticipantMetadata {
  backendProjectId?: string;
  backendChatId?: string;
  setupState?: "session" | "key";
  spentRub?: number;
  limitRub?: number;
}

export function createCodexChatParticipant(
  extensionContext: vscode.ExtensionContext,
  api: BackendApi,
  onStateChanged: () => Promise<void>
) {
  const handler: vscode.ChatRequestHandler = async (request, context, stream, token) => {
    const commandHandled = await handleParticipantCommand(request.command, api, stream, onStateChanged);

    if (commandHandled) {
      return commandHandled;
    }

    const auth = await ensureSignedInInteractive(api);

    if (!auth && !(await api.hasSession())) {
      stream.markdown("Setup cancelled. Use `/login` or `/register` when you are ready.");
      return {
        metadata: {
          setupState: "session"
        }
      };
    }

    const hasProviderKey = await ensureProviderKeyInteractive(api);

    if (!hasProviderKey) {
      stream.markdown("API key setup cancelled. Use `/key` to add it and continue.");
      return {
        metadata: {
          setupState: "key"
        }
      };
    }

    const payload = await buildPromptPayload(request);
    stream.progress(`Connecting to your private GPT workspace on ${DEFAULT_CODEX_MODEL_LABEL}...`);

    const project = await resolveBridgeProject(api);
    const chat = await resolveConversationChat(api, project, context, payload.titleSeed);
    const abortController = new AbortController();
    const cancellation = token.onCancellationRequested(() => abortController.abort());
    let billing: BillingSummary | undefined;

    try {
      for await (const event of api.streamMessage(chat.id, payload.content, payload.metadata, {
        signal: abortController.signal
      })) {
        if (event.type === "delta") {
          stream.markdown(event.delta);
          continue;
        }

        if (event.type === "done") {
          billing = event.billing;
        }
      }
    } finally {
      cancellation.dispose();
    }

    await onStateChanged();

    return {
      metadata: {
        backendProjectId: project.id,
        backendChatId: chat.id,
        spentRub: billing?.spentRub,
        limitRub: billing?.limitRub
      }
    };
  };

  const participant = vscode.chat.createChatParticipant(CHAT_PARTICIPANT_ID, handler);
  participant.iconPath = vscode.Uri.joinPath(extensionContext.extensionUri, "assets/codex-bridge.svg");
  participant.followupProvider = {
    provideFollowups(result) {
      const metadata = result.metadata as ParticipantMetadata | undefined;

      if (metadata?.setupState === "session") {
        return [
          { prompt: "/login", label: "Sign in" },
          { prompt: "/register", label: "Create account" },
          { prompt: "/help", label: "How it works" }
        ];
      }

      if (metadata?.setupState === "key") {
        return [
          { prompt: "/key", label: "Add API key" },
          { prompt: "/help", label: "How it works" }
        ];
      }

      return [
        { prompt: "/help", label: "How it works" },
        { prompt: "Continue this task and go deeper.", label: "Continue" }
      ];
    }
  };

  return participant;
}

export async function updateStatusBar(statusBar: vscode.StatusBarItem, api: BackendApi) {
  statusBar.command = "codexBridge.openChat";

  if (!(await api.hasSession())) {
    statusBar.text = "$(comment-discussion) GPT Workspace";
    statusBar.tooltip = `Open Chat and talk to @${CHAT_PARTICIPANT_NAME}.`;
    return;
  }

  if (!(await api.hasProviderKey())) {
    statusBar.text = "$(key) GPT Workspace";
    statusBar.tooltip = "Open Chat and add your personal model API key.";
    return;
  }

  try {
    const session = await api.getSession();
    statusBar.text = `$(comment-discussion) ${DEFAULT_CODEX_MODEL_LABEL} · ${formatRubles(session.billing.spentRub)}`;
    statusBar.tooltip = `Open Chat and talk to @${CHAT_PARTICIPANT_NAME}. This month: ${formatRubles(session.billing.spentRub)} / ${formatRubles(session.billing.limitRub)}.`;
  } catch {
    statusBar.text = "$(comment-discussion) GPT Workspace";
    statusBar.tooltip = `Open Chat and talk to @${CHAT_PARTICIPANT_NAME}.`;
  }
}

export async function openNativeChatSurface() {
  for (const command of CHAT_OPEN_COMMANDS) {
    try {
      await vscode.commands.executeCommand(command);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

export async function startFreshChat() {
  await openNativeChatSurface();

  for (const command of CHAT_NEW_COMMANDS) {
    try {
      await vscode.commands.executeCommand(command);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

export async function runLoginFlow(api: BackendApi) {
  const email = await promptForEmail("Sign in to GPT Workspace");

  if (!email) {
    return undefined;
  }

  const password = await promptForPassword("Sign in to GPT Workspace");

  if (!password) {
    return undefined;
  }

  const auth = await api.login(email, password);
  await applyAuthSession(api, auth);
  return auth;
}

export async function runRegisterFlow(api: BackendApi) {
  const name = await vscode.window.showInputBox({
    title: "Create GPT Workspace account",
    prompt: "Display name",
    ignoreFocusOut: true,
    validateInput: (value) => value.trim() ? null : "Display name is required."
  });

  if (!name) {
    return undefined;
  }

  const email = await promptForEmail("Create GPT Workspace account");

  if (!email) {
    return undefined;
  }

  const password = await promptForPassword("Create GPT Workspace account");

  if (!password) {
    return undefined;
  }

  const auth = await api.register(name.trim(), email, password);
  await applyAuthSession(api, auth);
  return auth;
}

export async function configureProviderKeyInteractive(api: BackendApi) {
  const apiKey = await vscode.window.showInputBox({
    title: "Model API key",
    prompt: "Paste your personal model API key",
    ignoreFocusOut: true,
    password: true,
    validateInput: (value) => value.trim() ? null : "The model API key is required."
  });

  if (!apiKey) {
    return false;
  }

  await api.storeProviderKey(apiKey.trim());
  return true;
}

export async function logout(api: BackendApi) {
  await api.clearSession();
  await setConfiguration("defaultProjectId", "");
}

export function formatRubles(value: number) {
  return `${value.toFixed(2)} RUB`;
}

async function handleParticipantCommand(
  command: string | undefined,
  api: BackendApi,
  stream: vscode.ChatResponseStream,
  onStateChanged: () => Promise<void>
) {
  switch (command) {
    case "help":
      stream.markdown([
        "# GPT Workspace",
        "",
        `- Write to **@${CHAT_PARTICIPANT_NAME}** in the Chat view.`,
        "- The first request will guide you through sign-in or registration.",
        "- Your personal API key is stored locally in VS Code.",
        `- Replies are streamed live from ${DEFAULT_CODEX_MODEL_LABEL} with ${DEFAULT_CODEX_REASONING} reasoning.`,
        "",
        "Commands:",
        "- `/login` sign in",
        "- `/register` create account",
        "- `/key` save or replace the API key",
        "- `/logout` sign out"
      ].join("\n"));
      return {};
    case "login": {
      const auth = await runLoginFlow(api);
      await onStateChanged();
      stream.markdown(auth
        ? `Signed in as **${auth.user.email}**.`
        : "Sign-in cancelled.");
      return {};
    }
    case "register": {
      const auth = await runRegisterFlow(api);
      await onStateChanged();
      stream.markdown(auth
        ? `Account created. Signed in as **${auth.user.email}**.`
        : "Registration cancelled.");
      return {};
    }
    case "key": {
      const saved = await configureProviderKeyInteractive(api);
      await onStateChanged();
      stream.markdown(saved
        ? "Model API key saved locally in VS Code."
        : "API key setup cancelled.");
      return {};
    }
    case "logout":
      await logout(api);
      await onStateChanged();
      stream.markdown("Signed out from GPT Workspace.");
      return {};
    default:
      return undefined;
  }
}

async function ensureSignedInInteractive(api: BackendApi) {
  if (await api.hasSession()) {
    return api.getSession().then((session) => ({
      token: "",
      user: session.user
    })).catch(() => undefined);
  }

  const action = await vscode.window.showQuickPick([
    {
      label: "Sign In",
      description: "Use an existing GPT Workspace account",
      id: "login" as const
    },
    {
      label: "Create Account",
      description: "Register a new GPT Workspace account",
      id: "register" as const
    }
  ], {
    title: "Set up GPT Workspace",
    placeHolder: "Choose how you want to continue"
  });

  if (!action) {
    return undefined;
  }

  return action.id === "register"
    ? runRegisterFlow(api)
    : runLoginFlow(api);
}

async function ensureProviderKeyInteractive(api: BackendApi) {
  if (await api.hasProviderKey()) {
    return true;
  }

  return configureProviderKeyInteractive(api);
}

async function applyAuthSession(api: BackendApi, auth: AuthResponse) {
  await api.storeSession(auth);
  await setConfiguration("defaultProjectId", "");
}

async function resolveBridgeProject(api: BackendApi): Promise<Project> {
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

  const project = await api.createProject(BRIDGE_PROJECT_NAME, BRIDGE_PROJECT_DESCRIPTION);
  await setConfiguration("defaultProjectId", project.id);
  return project;
}

async function resolveConversationChat(
  api: BackendApi,
  project: Project,
  context: vscode.ChatContext,
  titleSeed: string
) {
  const metadata = extractParticipantMetadata(context);

  if (metadata?.backendProjectId === project.id && metadata.backendChatId) {
    const existing = (await api.listChats(project.id)).find((chat) => chat.id === metadata.backendChatId);

    if (existing) {
      return existing;
    }
  }

  return api.createChat(project.id, deriveTitle(titleSeed));
}

function extractParticipantMetadata(context: vscode.ChatContext): ParticipantMetadata | undefined {
  for (let index = context.history.length - 1; index >= 0; index -= 1) {
    const item = context.history[index];

    if (!(item instanceof vscode.ChatResponseTurn)) {
      continue;
    }

    const metadata = item.result.metadata as ParticipantMetadata | undefined;

    if (metadata?.backendChatId) {
      return metadata;
    }
  }

  return undefined;
}

async function buildPromptPayload(request: vscode.ChatRequest) {
  const prompt = request.prompt.trim();
  const references = await renderReferences(request.references);

  if (!prompt && !references.length) {
    throw new Error("Write a prompt before sending.");
  }

  const content = [
    prompt,
    references.length > 0 ? "Attached context:\n\n" + references.join("\n\n") : ""
  ].filter(Boolean).join("\n\n");

  return {
    content,
    metadata: {
      bridgeModel: DEFAULT_CODEX_MODEL,
      referenceCount: request.references.length
    },
    titleSeed: prompt || "New chat"
  };
}

async function renderReferences(references: readonly vscode.ChatPromptReference[]) {
  const rendered: string[] = [];

  for (const [index, reference] of references.entries()) {
    const label = reference.modelDescription?.trim() || `Reference ${index + 1}`;
    const value = await renderReferenceValue(reference.value);

    if (!value) {
      continue;
    }

    rendered.push(`## ${label}\n\n${value}`);
  }

  return rendered;
}

async function renderReferenceValue(value: unknown) {
  if (typeof value === "string") {
    return truncateText(value, 12_000);
  }

  if (isUri(value)) {
    return renderUriReference(value);
  }

  if (isLocation(value)) {
    return renderLocationReference(value);
  }

  return "";
}

async function renderUriReference(uri: vscode.Uri) {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    const relativePath = vscode.workspace.asRelativePath(uri, false) || uri.fsPath || uri.toString();
    const content = truncateText(document.getText(), 12_000);

    return [
      `File: ${relativePath}`,
      `Language: ${document.languageId}`,
      "",
      `\`\`\`${document.languageId}`,
      content,
      "```"
    ].join("\n");
  } catch {
    return uri.toString();
  }
}

async function renderLocationReference(location: vscode.Location) {
  try {
    const document = await vscode.workspace.openTextDocument(location.uri);
    const relativePath = vscode.workspace.asRelativePath(location.uri, false) || location.uri.fsPath || location.uri.toString();
    const content = truncateText(document.getText(location.range), 12_000);

    return [
      `File: ${relativePath}`,
      `Selection: lines ${location.range.start.line + 1}-${location.range.end.line + 1}`,
      `Language: ${document.languageId}`,
      "",
      `\`\`\`${document.languageId}`,
      content,
      "```"
    ].join("\n");
  } catch {
    return location.uri.toString();
  }
}

function isLocation(value: unknown): value is vscode.Location {
  return typeof value === "object"
    && value !== null
    && "uri" in value
    && "range" in value;
}

function isUri(value: unknown): value is vscode.Uri {
  return typeof value === "object"
    && value !== null
    && "scheme" in value
    && "path" in value;
}

function truncateText(value: string, limit: number) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit).trimEnd()}\n\n... [truncated]`;
}

function deriveTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "New chat";
  }

  return normalized.length <= 48
    ? normalized
    : `${normalized.slice(0, 45).trimEnd()}...`;
}

async function promptForEmail(title: string) {
  return vscode.window.showInputBox({
    title,
    prompt: "Email address",
    ignoreFocusOut: true,
    validateInput: (value) => value.includes("@") ? null : "Enter a valid email address."
  });
}

async function promptForPassword(title: string) {
  return vscode.window.showInputBox({
    title,
    prompt: "Password",
    ignoreFocusOut: true,
    password: true,
    validateInput: (value) => value.length >= 8 ? null : "Password must contain at least 8 characters."
  });
}
