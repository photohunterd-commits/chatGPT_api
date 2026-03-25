import * as vscode from "vscode";
import { BackendApi } from "./backendApi.js";
import { CodexPanelController, updateStatusBar } from "./homeView.js";

export function activate(context: vscode.ExtensionContext) {
  const api = new BackendApi(context);
  const panel = new CodexPanelController(context, api);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

  const refreshAll = async () => {
    await updateStatusBar(statusBar, api);
    await panel.refresh();
  };

  statusBar.show();
  void refreshAll();
  void panel.autoOpenOncePerVersion();

  context.subscriptions.push(
    statusBar,
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
      await panel.open();
      await refreshAll();
    }),
    vscode.commands.registerCommand("codexBridge.refresh", refreshAll),
    vscode.commands.registerCommand("codexBridge.newChat", async () => {
      await panel.open();
      await panel.startNewChat();
      await refreshAll();
    }),
    vscode.commands.registerCommand("codexBridge.sendSelection", async () => {
      await panel.sendSelectionToChat();
      await refreshAll();
    }),
    vscode.commands.registerCommand("codexBridge.login", async () => {
      await panel.open();
    }),
    vscode.commands.registerCommand("codexBridge.register", async () => {
      await panel.open();
    }),
    vscode.commands.registerCommand("codexBridge.configureProviderKey", async () => {
      await panel.open();
    }),
    vscode.commands.registerCommand("codexBridge.logout", async () => {
      await panel.logout();
      await refreshAll();
    })
  );
}

export function deactivate() {
  return undefined;
}
