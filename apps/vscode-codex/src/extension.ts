import * as vscode from "vscode";
import { BackendApi } from "./backendApi.js";
import { CodexSidebarController, updateStatusBar } from "./homeView.js";

const VIEW_CONTAINER_ID = "photohunterd.gpt54Codex";
const VIEW_ID = "photohunterd.gpt54Codex.chat";
const LAST_AUTO_OPEN_VERSION_KEY = "codexBridge.lastAutoOpenedVersion";

export function activate(context: vscode.ExtensionContext) {
  const api = new BackendApi(context);
  const sidebar = new CodexSidebarController(context, api);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

  const refreshAll = async () => {
    await updateStatusBar(statusBar, api);
    await sidebar.refresh();
  };

  statusBar.show();
  void refreshAll();

  context.subscriptions.push(
    statusBar,
    vscode.window.registerWebviewViewProvider(VIEW_ID, sidebar, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("codexBridge")) {
        void refreshAll();
      }
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      void refreshAll();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexBridge.openChat", async () => {
      await vscode.commands.executeCommand(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
      await sidebar.reveal();
      await refreshAll();
    }),
    vscode.commands.registerCommand("codexBridge.refresh", refreshAll),
    vscode.commands.registerCommand("codexBridge.newChat", async () => {
      await vscode.commands.executeCommand(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
      await sidebar.reveal();
      await sidebar.startNewChat();
      await refreshAll();
    }),
    vscode.commands.registerCommand("codexBridge.sendSelection", async () => {
      await vscode.commands.executeCommand(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
      await sidebar.reveal();
      await sidebar.sendSelectionToChat();
      await refreshAll();
    }),
    vscode.commands.registerCommand("codexBridge.login", async () => {
      await vscode.commands.executeCommand(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
      await sidebar.reveal();
    }),
    vscode.commands.registerCommand("codexBridge.register", async () => {
      await vscode.commands.executeCommand(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
      await sidebar.reveal();
    }),
    vscode.commands.registerCommand("codexBridge.configureProviderKey", async () => {
      await vscode.commands.executeCommand(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
      await sidebar.reveal();
    }),
    vscode.commands.registerCommand("codexBridge.logout", async () => {
      await sidebar.logout();
      await refreshAll();
    })
  );

  void revealOnFirstStartup(context, sidebar, refreshAll);
}

export function deactivate() {
  return undefined;
}

async function revealOnFirstStartup(
  context: vscode.ExtensionContext,
  sidebar: CodexSidebarController,
  refreshAll: () => Promise<void>
) {
  const configuration = vscode.workspace.getConfiguration("codexBridge");
  const openOnStartup = configuration.get<boolean>("openOnStartup", true);

  if (!openOnStartup) {
    return;
  }

  const currentVersion = String(context.extension.packageJSON.version ?? "");
  const lastAutoOpenedVersion = context.globalState.get<string>(LAST_AUTO_OPEN_VERSION_KEY);

  if (!currentVersion || lastAutoOpenedVersion === currentVersion) {
    return;
  }

  try {
    await vscode.commands.executeCommand(`workbench.view.extension.${VIEW_CONTAINER_ID}`);
    await sidebar.reveal();
    await refreshAll();
    await context.globalState.update(LAST_AUTO_OPEN_VERSION_KEY, currentVersion);
  } catch {
    return;
  }
}
