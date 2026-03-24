import * as vscode from "vscode";
import { BackendApi, setConfiguration } from "./backendApi.js";
import { CodexChatProvider, updateStatusBar } from "./homeView.js";
import { type AuthResponse } from "./types.js";

export function activate(context: vscode.ExtensionContext) {
  const api = new BackendApi(context);
  const provider = new CodexChatProvider(context, api);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

  const refreshAll = async () => {
    await provider.refresh();
    await updateStatusBar(statusBar, api);
  };

  provider.setRefreshHandler(refreshAll);
  statusBar.command = "workbench.view.extension.codexBridge";
  statusBar.show();
  void refreshAll();

  context.subscriptions.push(
    statusBar,
    vscode.window.registerWebviewViewProvider("codexBridge.chat", provider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("codexBridge")) {
        void refreshAll();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexBridge.refresh", refreshAll),
    vscode.commands.registerCommand("codexBridge.newChat", () => provider.startNewChat()),
    vscode.commands.registerCommand("codexBridge.sendSelection", () => provider.sendSelectionToChat()),
    vscode.commands.registerCommand("codexBridge.logout", async () => {
      await provider.logout();
      vscode.window.showInformationMessage("Signed out from Codex.");
    }),
    vscode.commands.registerCommand("codexBridge.configureProviderKey", async () => {
      const apiKey = await vscode.window.showInputBox({
        title: "Model API key",
        prompt: "Paste your personal model API key",
        ignoreFocusOut: true,
        password: true,
        validateInput: (value) => value.trim() ? null : "The model API key is required."
      });

      if (!apiKey) {
        return;
      }

      await api.storeProviderKey(apiKey.trim());
      await refreshAll();
      vscode.window.showInformationMessage("Model API key stored locally in VS Code.");
    }),
    vscode.commands.registerCommand("codexBridge.login", async () => {
      const email = await promptForEmail("Sign in");
      if (!email) return;
      const password = await promptForPassword("Sign in");
      if (!password) return;

      const auth = await withErrorBoundary(() => api.login(email, password));
      if (!auth) return;

      await applyAuthSession(api, auth);
      await refreshAll();
      vscode.window.showInformationMessage(`Signed in as ${auth.user.email}`);
    }),
    vscode.commands.registerCommand("codexBridge.register", async () => {
      const name = await vscode.window.showInputBox({
        title: "Create account",
        prompt: "Display name",
        ignoreFocusOut: true,
        validateInput: (value) => value.trim() ? null : "Display name is required."
      });
      if (!name) return;

      const email = await promptForEmail("Create account");
      if (!email) return;
      const password = await promptForPassword("Create account");
      if (!password) return;

      const auth = await withErrorBoundary(() => api.register(name, email, password));
      if (!auth) return;

      await applyAuthSession(api, auth);
      await refreshAll();
      vscode.window.showInformationMessage(`Signed in as ${auth.user.email}`);
    })
  );
}

export function deactivate() {
  return undefined;
}

async function applyAuthSession(api: BackendApi, auth: AuthResponse) {
  await api.storeSession(auth);
  await setConfiguration("defaultProjectId", "");
  await setConfiguration("defaultChatId", "");
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

function isProviderKeyNotice(message: string) {
  const lowered = message.toLowerCase();
  return lowered.includes("balance")
    || lowered.includes("quota")
    || lowered.includes("api key")
    || lowered.includes("provider")
    || lowered.includes("budget")
    || lowered.includes("limit")
    || lowered.includes("pricing");
}

async function withErrorBoundary<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Codex failure.";
    if (isProviderKeyNotice(message)) {
      vscode.window.showWarningMessage(message);
    } else {
      vscode.window.showErrorMessage(message);
    }
    return undefined;
  }
}
