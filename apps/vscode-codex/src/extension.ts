import * as vscode from "vscode";
import { BackendApi } from "./backendApi.js";
import { CodexSidebarController, updateStatusBar } from "./homeView.js";

const VIEW_CONTAINER_ID = "photohunterd.gpt54Codex";
const VIEW_ID = "photohunterd.gpt54Codex.chat";

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
}

export function deactivate() {
  return undefined;
}
