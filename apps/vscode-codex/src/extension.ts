import * as vscode from "vscode";
import { BackendApi, setConfiguration } from "./backendApi.js";
import { CodexHomeProvider, formatRubles, updateStatusBar } from "./homeView.js";
import {
  DEFAULT_CODEX_MODEL,
  DEFAULT_CODEX_MODEL_LABEL,
  DEFAULT_CODEX_REASONING,
  type Chat,
  type Project
} from "./types.js";

class BridgeItem extends vscode.TreeItem {
  constructor(
    public readonly kind: "project" | "chat" | "info",
    public readonly payload: Project | Chat | undefined,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = kind;

    if (kind === "project" && payload) {
      const project = payload as Project;
      this.description = project.chatCount > 0 ? `${project.chatCount} chats` : "Empty";
      this.tooltip = project.description || project.name;
      this.iconPath = new vscode.ThemeIcon("folder-library");
      this.command = { command: "codexBridge.setProject", title: "Set Active Project", arguments: [project] };
    }

    if (kind === "chat" && payload) {
      const chat = payload as Chat;
      this.description = `${chat.model} / ${chat.reasoningEffort}`;
      this.tooltip = `${chat.title}\n${chat.model} / ${chat.reasoningEffort}`;
      this.iconPath = new vscode.ThemeIcon("comment-discussion");
      this.command = { command: "codexBridge.setChat", title: "Set Active Chat", arguments: [chat] };
    }

    if (kind === "info") {
      this.iconPath = new vscode.ThemeIcon("info");
    }
  }
}

class CodexBridgeProvider implements vscode.TreeDataProvider<BridgeItem> {
  private readonly emitter = new vscode.EventEmitter<BridgeItem | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly api: BackendApi) {}

  refresh() {
    this.emitter.fire();
  }

  getTreeItem(element: BridgeItem) {
    return element;
  }

  async getChildren(element?: BridgeItem): Promise<BridgeItem[]> {
    if (!element) {
      if (!(await this.api.hasSession())) {
        return [new BridgeItem("info", undefined, "Sign in to unlock private projects and chats.", vscode.TreeItemCollapsibleState.None)];
      }

      const projects = await this.api.listProjects();

      if (projects.length === 0) {
        return [new BridgeItem("info", undefined, "No projects yet. Create one from the Codex panel.", vscode.TreeItemCollapsibleState.None)];
      }

      return projects.map((project) => new BridgeItem("project", project, project.name, vscode.TreeItemCollapsibleState.Expanded));
    }

    if (element.kind === "project" && element.payload) {
      const chats = await this.api.listChats((element.payload as Project).id);

      if (chats.length === 0) {
        return [new BridgeItem("info", undefined, "No chats yet. Create one for this project.", vscode.TreeItemCollapsibleState.None)];
      }

      return chats.map((chat) => new BridgeItem("chat", chat, chat.title, vscode.TreeItemCollapsibleState.None));
    }

    return [];
  }
}

export function activate(context: vscode.ExtensionContext) {
  const api = new BackendApi(context);
  const treeProvider = new CodexBridgeProvider(api);
  const homeProvider = new CodexHomeProvider(context, api);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

  const refreshAll = async () => {
    treeProvider.refresh();
    await homeProvider.refresh();
    await updateStatusBar(statusBar, api);
  };

  statusBar.command = "codexBridge.login";
  statusBar.show();
  void refreshAll();

  context.subscriptions.push(
    statusBar,
    vscode.window.registerTreeDataProvider("codexBridge.explorer", treeProvider),
    vscode.window.registerWebviewViewProvider("codexBridge.home", homeProvider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("codexBridge")) {
        void refreshAll();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexBridge.register", async () => {
      const name = await vscode.window.showInputBox({ title: "Create account", prompt: "Display name", ignoreFocusOut: true, validateInput: (value) => value.trim() ? null : "Display name is required." });
      if (!name) return;
      const email = await promptForEmail("Create account");
      if (!email) return;
      const password = await promptForPassword("Create account");
      if (!password) return;

      const auth = await withErrorBoundary(() => api.register(name, email, password));
      if (!auth) return;

      await api.storeSession(auth);
      await refreshAll();
      vscode.window.showInformationMessage(`Signed in as ${auth.user.email}`);
    }),
    vscode.commands.registerCommand("codexBridge.login", async () => {
      const email = await promptForEmail("Sign in");
      if (!email) return;
      const password = await promptForPassword("Sign in");
      if (!password) return;

      const auth = await withErrorBoundary(() => api.login(email, password));
      if (!auth) return;

      await api.storeSession(auth);
      await refreshAll();
      vscode.window.showInformationMessage(`Signed in as ${auth.user.email}`);
    }),
    vscode.commands.registerCommand("codexBridge.logout", async () => {
      await api.clearSession();
      await setConfiguration("defaultProjectId", "");
      await setConfiguration("defaultChatId", "");
      await refreshAll();
      vscode.window.showInformationMessage("Signed out from Codex Bridge.");
    }),
    vscode.commands.registerCommand("codexBridge.configureProviderKey", async () => {
      const providerApiKey = await vscode.window.showInputBox({ title: "Model API key", prompt: "Paste your personal provider API key", ignoreFocusOut: true, password: true, validateInput: (value) => value.trim() ? null : "The model API key is required." });
      if (!providerApiKey) return;
      await api.storeProviderKey(providerApiKey);
      await refreshAll();
      vscode.window.showInformationMessage("Model API key stored locally in VS Code Secret Storage.");
    }),
    vscode.commands.registerCommand("codexBridge.refresh", refreshAll),
    vscode.commands.registerCommand("codexBridge.setProject", async (project?: Project) => {
      const selected = project ?? await pickProject(api);
      if (!selected) return;
      await setConfiguration("defaultProjectId", selected.id);
      await setConfiguration("defaultChatId", "");
      await refreshAll();
      vscode.window.showInformationMessage(`Active project: ${selected.name}`);
    }),
    vscode.commands.registerCommand("codexBridge.setChat", async (chat?: Chat) => {
      const selected = chat ?? await pickChat(api);
      if (!selected) return;
      await setConfiguration("defaultProjectId", selected.projectId);
      await setConfiguration("defaultChatId", selected.id);
      await refreshAll();
      vscode.window.showInformationMessage(`Active chat: ${selected.title}`);
    }),
    vscode.commands.registerCommand("codexBridge.pickProject", async () => vscode.commands.executeCommand("codexBridge.setProject")),
    vscode.commands.registerCommand("codexBridge.pickChat", async () => vscode.commands.executeCommand("codexBridge.setChat")),
    vscode.commands.registerCommand("codexBridge.createProject", async () => {
      if (!(await ensureSignedIn(api))) return;
      const name = await vscode.window.showInputBox({ title: "Create project", prompt: "Project name", ignoreFocusOut: true, validateInput: (value) => value.trim() ? null : "Project name is required." });
      if (!name) return;
      const description = (await vscode.window.showInputBox({ title: "Create project", prompt: "Short description", ignoreFocusOut: true })) ?? "";
      const project = await withErrorBoundary(() => api.createProject(name, description));
      if (!project) return;
      await setConfiguration("defaultProjectId", project.id);
      await refreshAll();
      vscode.window.showInformationMessage(`Created project: ${project.name}`);
    }),
    vscode.commands.registerCommand("codexBridge.createChat", async () => {
      if (!(await ensureSignedIn(api))) return;
      const project = await ensureProject(api);
      if (!project) return;
      const title = await vscode.window.showInputBox({ title: "Create chat", prompt: `Chat title (${DEFAULT_CODEX_MODEL_LABEL} / ${DEFAULT_CODEX_REASONING})`, ignoreFocusOut: true, value: "Code review" });
      if (!title) return;
      const chat = await withErrorBoundary(() => api.createChat(project.id, title));
      if (!chat) return;
      await setConfiguration("defaultChatId", chat.id);
      await refreshAll();
      vscode.window.showInformationMessage(`Created chat: ${chat.title} (${DEFAULT_CODEX_MODEL_LABEL})`);
    }),
    vscode.commands.registerCommand("codexBridge.sendSelection", async () => {
      if (!(await ensureSignedIn(api))) return;
      if (!(await ensureProviderKey(api))) return;
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Open a file before sending code to chat.");
        return;
      }

      const chat = await ensureChat(api);
      if (!chat) return;

      const selection = editor.selection;
      const text = selection.isEmpty ? editor.document.getText() : editor.document.getText(selection);
      if (!text.trim()) {
        vscode.window.showWarningMessage("The current selection is empty.");
        return;
      }

      const content = [
        "Please review the following workspace context from VS Code.",
        `File: ${editor.document.uri.fsPath}`,
        `Language: ${editor.document.languageId}`,
        selection.isEmpty ? "Selection: full file" : `Selection: lines ${selection.start.line + 1}-${selection.end.line + 1}`,
        "",
        "```",
        text,
        "```"
      ].join("\n");

      const result = await withErrorBoundary(() => api.sendMessage(chat.id, content, {
        filePath: editor.document.uri.fsPath,
        language: editor.document.languageId,
        selectionStartLine: selection.start.line + 1,
        selectionEndLine: selection.end.line + 1,
        selectionEmpty: selection.isEmpty,
        bridgeModel: DEFAULT_CODEX_MODEL
      }));

      if (!result) return;
      await refreshAll();
      vscode.window.showInformationMessage(`Sent code context to chat: ${chat.title}. Monthly spend: ${formatRubles(result.billing.spentRub)}`);
    })
  );
}

export function deactivate() {
  return undefined;
}

async function promptForEmail(title: string) {
  return vscode.window.showInputBox({ title, prompt: "Email address", ignoreFocusOut: true, validateInput: (value) => value.includes("@") ? null : "Enter a valid email address." });
}

async function promptForPassword(title: string) {
  return vscode.window.showInputBox({ title, prompt: "Password", ignoreFocusOut: true, password: true, validateInput: (value) => value.length >= 8 ? null : "Password must contain at least 8 characters." });
}

async function pickProject(api: BackendApi): Promise<Project | undefined> {
  return withErrorBoundary(async () => {
    if (!(await ensureSignedIn(api))) return undefined;
    const projects = await api.listProjects();
    if (projects.length === 0) {
      vscode.window.showWarningMessage("No projects found. Create one first.");
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(projects.map((project) => ({ label: project.name, description: project.description || `${project.chatCount} chats`, project })), { placeHolder: "Select a project" });
    return selected?.project;
  });
}

async function pickChat(api: BackendApi): Promise<Chat | undefined> {
  return withErrorBoundary(async () => {
    const project = await ensureProject(api);
    if (!project) return undefined;
    const chats = await api.listChats(project.id);
    if (chats.length === 0) {
      vscode.window.showWarningMessage("No chats found for the active project.");
      return undefined;
    }
    const selected = await vscode.window.showQuickPick(chats.map((chat) => ({ label: chat.title, description: `${chat.model} / ${chat.reasoningEffort}`, chat })), { placeHolder: "Select a chat" });
    return selected?.chat;
  });
}

async function ensureSignedIn(api: BackendApi) {
  if (await api.hasSession()) return true;
  vscode.window.showWarningMessage("Sign in to the backend before using Codex Bridge.");
  return false;
}

async function ensureProviderKey(api: BackendApi) {
  if (await api.hasProviderKey()) return true;
  const action = "Configure Key";
  const choice = await vscode.window.showWarningMessage("Configure your personal model API key before sending prompts from VS Code.", action);
  if (choice === action) await vscode.commands.executeCommand("codexBridge.configureProviderKey");
  return api.hasProviderKey();
}

async function ensureProject(api: BackendApi): Promise<Project | undefined> {
  if (!(await ensureSignedIn(api))) return undefined;
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const projectId = configuration.get<string>("defaultProjectId")?.trim();
  const projects = await withErrorBoundary(() => api.listProjects());
  if (!projects || projects.length === 0) {
    vscode.window.showWarningMessage("No projects available. Create a project first.");
    return undefined;
  }
  const existing = projectId ? projects.find((project) => project.id === projectId) : undefined;
  if (existing) return existing;
  await setConfiguration("defaultProjectId", projects[0].id);
  return projects[0];
}

async function ensureChat(api: BackendApi): Promise<Chat | undefined> {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const chatId = configuration.get<string>("defaultChatId")?.trim();
  const project = await ensureProject(api);
  if (!project) return undefined;
  const chats = await withErrorBoundary(() => api.listChats(project.id));
  if (!chats || chats.length === 0) {
    vscode.window.showWarningMessage("No chats available. Create a chat first.");
    return undefined;
  }
  const existing = chatId ? chats.find((chat) => chat.id === chatId) : undefined;
  if (existing) return existing;
  await setConfiguration("defaultChatId", chats[0].id);
  return chats[0];
}

function isProviderKeyNotice(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("balance") || lowered.includes("quota") || lowered.includes("api key") || lowered.includes("provider") || lowered.includes("budget") || lowered.includes("limit") || lowered.includes("pricing");
}

async function withErrorBoundary<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Codex Bridge failure.";
    if (isProviderKeyNotice(message)) vscode.window.showWarningMessage(message);
    else vscode.window.showErrorMessage(message);
    return undefined;
  }
}
