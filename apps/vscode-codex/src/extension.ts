import * as vscode from "vscode";
import { BackendApi } from "./backendApi.js";
import {
  CHAT_PARTICIPANT_ID,
  CHAT_PARTICIPANT_NAME,
  configureProviderKeyInteractive,
  createCodexChatParticipant,
  logout,
  openNativeChatSurface,
  runLoginFlow,
  runRegisterFlow,
  startFreshChat,
  updateStatusBar
} from "./chatParticipant.js";

export function activate(context: vscode.ExtensionContext) {
  const api = new BackendApi(context);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  const refreshAll = async () => {
    await updateStatusBar(statusBar, api);
  };

  statusBar.show();
  void refreshAll();

  const participant = createCodexChatParticipant(context, api, refreshAll);

  context.subscriptions.push(
    statusBar,
    participant,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("codexBridge")) {
        void refreshAll();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexBridge.openChat", async () => {
      const opened = await openNativeChatSurface();

      if (!opened) {
        vscode.window.showInformationMessage(
          `Open the Chat view in VS Code and talk to @${CHAT_PARTICIPANT_NAME}.`
        );
      }
    }),
    vscode.commands.registerCommand("codexBridge.refresh", refreshAll),
    vscode.commands.registerCommand("codexBridge.newChat", async () => {
      const started = await startFreshChat();

      if (!started) {
        vscode.window.showInformationMessage(
          `Start a new thread in the Chat view and invoke @${CHAT_PARTICIPANT_NAME}.`
        );
      }
    }),
    vscode.commands.registerCommand("codexBridge.sendSelection", async () => {
      const opened = await openNativeChatSurface();
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showWarningMessage("Open a file or code selection before using this command.");
        return;
      }

      const selection = editor.selection;
      const selectionText = selection.isEmpty
        ? editor.document.getText()
        : editor.document.getText(selection);

      if (!selectionText.trim()) {
        vscode.window.showWarningMessage("The current editor selection is empty.");
        return;
      }

      if (!opened) {
        vscode.window.showInformationMessage(
          `Open the Chat view and ask @${CHAT_PARTICIPANT_NAME} about the current code selection.`
        );
        return;
      }

      vscode.window.showInformationMessage(
        `Chat is open. Attach the current selection or paste it into @${CHAT_PARTICIPANT_NAME}.`
      );
    }),
    vscode.commands.registerCommand("codexBridge.logout", async () => {
      await logout(api);
      await refreshAll();
      vscode.window.showInformationMessage("Signed out from GPT Workspace.");
    }),
    vscode.commands.registerCommand("codexBridge.configureProviderKey", async () => {
      const saved = await withErrorBoundary(() => configureProviderKeyInteractive(api));

      if (!saved) {
        return;
      }

      await refreshAll();
      vscode.window.showInformationMessage("Model API key stored locally in VS Code.");
    }),
    vscode.commands.registerCommand("codexBridge.login", async () => {
      const auth = await withErrorBoundary(() => runLoginFlow(api));

      if (!auth) {
        return;
      }

      await refreshAll();
      vscode.window.showInformationMessage(`Signed in as ${auth.user.email}`);
    }),
    vscode.commands.registerCommand("codexBridge.register", async () => {
      const auth = await withErrorBoundary(() => runRegisterFlow(api));

      if (!auth) {
        return;
      }

      await refreshAll();
      vscode.window.showInformationMessage(`Signed in as ${auth.user.email}`);
    })
  );
}

export function deactivate() {
  return undefined;
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
    const message = error instanceof Error ? error.message : "Unexpected GPT Workspace failure.";

    if (isProviderKeyNotice(message)) {
      vscode.window.showWarningMessage(message);
    } else {
      vscode.window.showErrorMessage(message);
    }

    return undefined;
  }
}
