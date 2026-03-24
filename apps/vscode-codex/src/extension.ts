import axios, { type AxiosInstance } from "axios";
import * as vscode from "vscode";

const AUTH_TOKEN_SECRET = "codexBridge.authToken";
const PROVIDER_KEY_SECRET = "codexBridge.providerApiKey";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface Project {
  id: string;
  name: string;
  description: string;
  chatCount: number;
  lastMessageAt: string | null;
}

interface Chat {
  id: string;
  projectId: string;
  title: string;
  model: string;
  reasoningEffort: string;
  lastMessageAt: string | null;
}

interface ProjectResponse {
  items: Project[];
}

interface ChatResponse {
  items: Chat[];
}

interface MeResponse {
  user: User;
}

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
      this.description = project.chatCount > 0 ? `${project.chatCount} chats` : "empty";
      this.tooltip = project.description || project.name;
      this.command = {
        command: "codexBridge.setProject",
        title: "Set Active Project",
        arguments: [project]
      };
    }

    if (kind === "chat" && payload) {
      const chat = payload as Chat;
      this.description = chat.model;
      this.tooltip = `${chat.title}\n${chat.model} / ${chat.reasoningEffort}`;
      this.command = {
        command: "codexBridge.setChat",
        title: "Set Active Chat",
        arguments: [chat]
      };
    }

    if (kind === "info") {
      this.description = "";
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

  getTreeItem(element: BridgeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: BridgeItem): Promise<BridgeItem[]> {
    if (!element) {
      if (!(await this.api.hasSession())) {
        return [new BridgeItem("info", undefined, "Sign in to load your private workspace.", vscode.TreeItemCollapsibleState.None)];
      }

      const projects = await this.api.listProjects();

      if (projects.length === 0) {
        return [new BridgeItem("info", undefined, "No projects yet. Create one from the title bar.", vscode.TreeItemCollapsibleState.None)];
      }

      return projects.map(
        (project) =>
          new BridgeItem("project", project, project.name, vscode.TreeItemCollapsibleState.Collapsed)
      );
    }

    if (element.kind === "project" && element.payload) {
      const chats = await this.api.listChats((element.payload as Project).id);

      if (chats.length === 0) {
        return [new BridgeItem("info", undefined, "No chats yet. Create one for this project.", vscode.TreeItemCollapsibleState.None)];
      }

      return chats.map(
        (chat) => new BridgeItem("chat", chat, chat.title, vscode.TreeItemCollapsibleState.None)
      );
    }

    return [];
  }
}

class BackendApi {
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

  async createChat(projectId: string, title: string) {
    const response = await (await this.client()).post<Chat>(`/api/projects/${projectId}/chats`, {
      title
    });

    return response.data;
  }

  async sendMessage(chatId: string, content: string, metadata: Record<string, unknown>) {
    await (await this.client({ includeProviderKey: true })).post(`/api/chats/${chatId}/messages`, {
      content,
      source: "vscode",
      metadata
    });
  }

  async getCurrentUser() {
    const response = await (await this.client()).get<MeResponse>("/api/me");
    return response.data.user;
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
    const configuration = vscode.workspace.getConfiguration("codexBridge");
    const baseUrl = configuration.get<string>("baseUrl")?.trim();

    if (!baseUrl) {
      throw new Error("codexBridge.baseUrl is not configured.");
    }

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

    return axios.create({
      baseURL: baseUrl.replace(/\/+$/, ""),
      headers,
      timeout: 30000
    });
  }
}

export function activate(context: vscode.ExtensionContext) {
  const api = new BackendApi(context);
  const provider = new CodexBridgeProvider(api);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

  statusBar.command = "codexBridge.login";
  statusBar.show();
  void updateStatusBar(statusBar, api);

  context.subscriptions.push(
    statusBar,
    vscode.window.registerTreeDataProvider("codexBridge.explorer", provider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("codexBridge")) {
        void updateStatusBar(statusBar, api);
        provider.refresh();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexBridge.register", async () => {
      const name = await vscode.window.showInputBox({
        title: "Register",
        prompt: "Display name",
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? null : "Display name is required.")
      });

      if (!name) {
        return;
      }

      const email = await promptForEmail("Register");

      if (!email) {
        return;
      }

      const password = await promptForPassword("Register");

      if (!password) {
        return;
      }

      const auth = await withErrorBoundary(() => api.register(name, email, password));

      if (!auth) {
        return;
      }

      await api.storeSession(auth);
      provider.refresh();
      await updateStatusBar(statusBar, api);
      vscode.window.showInformationMessage(`Signed in as ${auth.user.email}`);
    }),
    vscode.commands.registerCommand("codexBridge.login", async () => {
      const email = await promptForEmail("Sign In");

      if (!email) {
        return;
      }

      const password = await promptForPassword("Sign In");

      if (!password) {
        return;
      }

      const auth = await withErrorBoundary(() => api.login(email, password));

      if (!auth) {
        return;
      }

      await api.storeSession(auth);
      provider.refresh();
      await updateStatusBar(statusBar, api);
      vscode.window.showInformationMessage(`Signed in as ${auth.user.email}`);
    }),
    vscode.commands.registerCommand("codexBridge.logout", async () => {
      await api.clearSession();
      await setConfiguration("defaultProjectId", "");
      await setConfiguration("defaultChatId", "");
      provider.refresh();
      await updateStatusBar(statusBar, api);
      vscode.window.showInformationMessage("Signed out from Codex Bridge.");
    }),
    vscode.commands.registerCommand("codexBridge.configureProviderKey", async () => {
      const providerApiKey = await vscode.window.showInputBox({
        title: "Model API Key",
        prompt: "Paste your provider API key",
        ignoreFocusOut: true,
        password: true,
        validateInput: (value) => (value.trim() ? null : "The model API key is required.")
      });

      if (!providerApiKey) {
        return;
      }

      await api.storeProviderKey(providerApiKey);
      await updateStatusBar(statusBar, api);
      vscode.window.showInformationMessage("Model API key stored locally in VS Code Secret Storage.");
    }),
    vscode.commands.registerCommand("codexBridge.refresh", async () => {
      provider.refresh();
      await updateStatusBar(statusBar, api);
    }),
    vscode.commands.registerCommand("codexBridge.setProject", async (project?: Project) => {
      const selected = project ?? (await pickProject(api));

      if (!selected) {
        return;
      }

      await setConfiguration("defaultProjectId", selected.id);
      await setConfiguration("defaultChatId", "");
      await updateStatusBar(statusBar, api);
      provider.refresh();
      vscode.window.showInformationMessage(`Active project: ${selected.name}`);
    }),
    vscode.commands.registerCommand("codexBridge.setChat", async (chat?: Chat) => {
      const selected = chat ?? (await pickChat(api));

      if (!selected) {
        return;
      }

      await setConfiguration("defaultProjectId", selected.projectId);
      await setConfiguration("defaultChatId", selected.id);
      await updateStatusBar(statusBar, api);
      provider.refresh();
      vscode.window.showInformationMessage(`Active chat: ${selected.title}`);
    }),
    vscode.commands.registerCommand("codexBridge.pickProject", async () => {
      await vscode.commands.executeCommand("codexBridge.setProject");
    }),
    vscode.commands.registerCommand("codexBridge.pickChat", async () => {
      await vscode.commands.executeCommand("codexBridge.setChat");
    }),
    vscode.commands.registerCommand("codexBridge.createProject", async () => {
      if (!(await ensureSignedIn(api))) {
        return;
      }

      const name = await vscode.window.showInputBox({
        title: "Create project",
        prompt: "Project name",
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim() ? null : "Project name is required.")
      });

      if (!name) {
        return;
      }

      const description = (await vscode.window.showInputBox({
        title: "Create project",
        prompt: "Short description",
        ignoreFocusOut: true
      })) ?? "";

      const project = await withErrorBoundary(() => api.createProject(name, description));

      if (!project) {
        return;
      }

      await setConfiguration("defaultProjectId", project.id);
      provider.refresh();
      await updateStatusBar(statusBar, api);
      vscode.window.showInformationMessage(`Created project: ${project.name}`);
    }),
    vscode.commands.registerCommand("codexBridge.createChat", async () => {
      if (!(await ensureSignedIn(api))) {
        return;
      }

      const project = await ensureProject(api);

      if (!project) {
        return;
      }

      const title = await vscode.window.showInputBox({
        title: "Create chat",
        prompt: "Chat title",
        ignoreFocusOut: true,
        value: "Workspace review"
      });

      if (!title) {
        return;
      }

      const chat = await withErrorBoundary(() => api.createChat(project.id, title));

      if (!chat) {
        return;
      }

      await setConfiguration("defaultChatId", chat.id);
      provider.refresh();
      await updateStatusBar(statusBar, api);
      vscode.window.showInformationMessage(`Created chat: ${chat.title}`);
    }),
    vscode.commands.registerCommand("codexBridge.sendSelection", async () => {
      if (!(await ensureSignedIn(api))) {
        return;
      }

      if (!(await ensureProviderKey(api))) {
        return;
      }

      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showWarningMessage("Open a file before sending code to chat.");
        return;
      }

      const chat = await ensureChat(api);

      if (!chat) {
        return;
      }

      const selection = editor.selection;
      const text = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);

      if (!text.trim()) {
        vscode.window.showWarningMessage("The current selection is empty.");
        return;
      }

      const content = [
        "Please review the following workspace context from VS Code.",
        `File: ${editor.document.uri.fsPath}`,
        `Language: ${editor.document.languageId}`,
        selection.isEmpty
          ? "Selection: full file"
          : `Selection: lines ${selection.start.line + 1}-${selection.end.line + 1}`,
        "",
        "```",
        text,
        "```"
      ].join("\n");

      const metadata = {
        filePath: editor.document.uri.fsPath,
        language: editor.document.languageId,
        selectionStartLine: selection.start.line + 1,
        selectionEndLine: selection.end.line + 1,
        selectionEmpty: selection.isEmpty
      };

      const result = await withErrorBoundary(() => api.sendMessage(chat.id, content, metadata));

      if (result === undefined) {
        return;
      }

      vscode.window.showInformationMessage(`Sent code context to chat: ${chat.title}`);
    })
  );
}

export function deactivate() {
  return undefined;
}

async function promptForEmail(title: string) {
  return vscode.window.showInputBox({
    title,
    prompt: "Email address",
    ignoreFocusOut: true,
    validateInput: (value) => (value.includes("@") ? null : "Enter a valid email address.")
  });
}

async function promptForPassword(title: string) {
  return vscode.window.showInputBox({
    title,
    prompt: "Password",
    ignoreFocusOut: true,
    password: true,
    validateInput: (value) => (value.length >= 8 ? null : "Password must contain at least 8 characters.")
  });
}

async function pickProject(api: BackendApi): Promise<Project | undefined> {
  return withErrorBoundary(async () => {
    if (!(await ensureSignedIn(api))) {
      return undefined;
    }

    const projects = await api.listProjects();

    if (projects.length === 0) {
      vscode.window.showWarningMessage("No projects found. Create one first.");
      return undefined;
    }

    const selected = await vscode.window.showQuickPick(
      projects.map((project) => ({
        label: project.name,
        description: project.description,
        project
      })),
      {
        placeHolder: "Select a project"
      }
    );

    return selected?.project;
  });
}

async function pickChat(api: BackendApi): Promise<Chat | undefined> {
  return withErrorBoundary(async () => {
    const project = await ensureProject(api);

    if (!project) {
      return undefined;
    }

    const chats = await api.listChats(project.id);

    if (chats.length === 0) {
      vscode.window.showWarningMessage("No chats found for the active project.");
      return undefined;
    }

    const selected = await vscode.window.showQuickPick(
      chats.map((chat) => ({
        label: chat.title,
        description: `${chat.model} / ${chat.reasoningEffort}`,
        chat
      })),
      {
        placeHolder: "Select a chat"
      }
    );

    return selected?.chat;
  });
}

async function ensureSignedIn(api: BackendApi) {
  if (await api.hasSession()) {
    return true;
  }

  vscode.window.showWarningMessage("Sign in to the backend before using Codex Bridge.");
  return false;
}

async function ensureProviderKey(api: BackendApi) {
  if (await api.hasProviderKey()) {
    return true;
  }

  const action = "Configure Key";
  const choice = await vscode.window.showWarningMessage(
    "Configure your model API key before sending prompts from VS Code.",
    action
  );

  if (choice === action) {
    await vscode.commands.executeCommand("codexBridge.configureProviderKey");
  }

  return api.hasProviderKey();
}

async function ensureProject(api: BackendApi): Promise<Project | undefined> {
  if (!(await ensureSignedIn(api))) {
    return undefined;
  }

  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const projectId = configuration.get<string>("defaultProjectId")?.trim();
  const projects = await withErrorBoundary(() => api.listProjects());

  if (!projects || projects.length === 0) {
    vscode.window.showWarningMessage("No projects available. Create a project first.");
    return undefined;
  }

  const existing = projectId ? projects.find((project) => project.id === projectId) : undefined;

  if (existing) {
    return existing;
  }

  const firstProject = projects[0];
  await setConfiguration("defaultProjectId", firstProject.id);
  return firstProject;
}

async function ensureChat(api: BackendApi): Promise<Chat | undefined> {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const chatId = configuration.get<string>("defaultChatId")?.trim();
  const project = await ensureProject(api);

  if (!project) {
    return undefined;
  }

  const chats = await withErrorBoundary(() => api.listChats(project.id));

  if (!chats || chats.length === 0) {
    vscode.window.showWarningMessage("No chats available. Create a chat first.");
    return undefined;
  }

  const existing = chatId ? chats.find((chat) => chat.id === chatId) : undefined;

  if (existing) {
    return existing;
  }

  const firstChat = chats[0];
  await setConfiguration("defaultChatId", firstChat.id);
  return firstChat;
}

async function setConfiguration(key: string, value: string) {
  await vscode.workspace.getConfiguration("codexBridge").update(
    key,
    value,
    vscode.ConfigurationTarget.Global
  );
}

async function updateStatusBar(statusBar: vscode.StatusBarItem, api: BackendApi) {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const email = configuration.get<string>("userEmail")?.trim();
  const projectId = configuration.get<string>("defaultProjectId")?.trim();
  const chatId = configuration.get<string>("defaultChatId")?.trim();
  const hasSession = await api.hasSession();
  const hasProviderKey = await api.hasProviderKey();

  if (!hasSession) {
    statusBar.command = "codexBridge.login";
    statusBar.text = "$(account) Codex Sign In";
    statusBar.tooltip = "Sign in to the private GPT-5.4 workspace backend.";
    return;
  }

  if (!hasProviderKey) {
    statusBar.command = "codexBridge.configureProviderKey";
    statusBar.text = "$(key) Add Model Key";
    statusBar.tooltip = "Store your personal model API key in VS Code Secret Storage.";
    return;
  }

  statusBar.command = "codexBridge.pickChat";
  statusBar.text = `$(comment-discussion) ${email || "Codex Bridge"}`;
  statusBar.tooltip = [
    `User: ${email || "signed in"}`,
    projectId ? `Project: ${projectId}` : "Project: not selected",
    chatId ? `Chat: ${chatId}` : "Chat: not selected"
  ].join("\n");
}

function isProviderKeyNotice(message: string) {
  return message.includes("balance")
    || message.includes("quota")
    || message.includes("API key")
    || message.includes("provider");
}

async function withErrorBoundary<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected Codex Bridge failure.";

    if (isProviderKeyNotice(message)) {
      vscode.window.showWarningMessage(message);
    } else {
      vscode.window.showErrorMessage(message);
    }

    return undefined;
  }
}
