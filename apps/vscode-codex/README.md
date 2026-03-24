# Codex Project Bridge

Codex Project Bridge connects VS Code to the GPT-5.4 workspace backend.

## Features

- Register and sign in to a private backend user account.
- Store the model API key locally in VS Code Secret Storage.
- Browse backend projects and chats from the activity bar.
- Pick an active project or chat for the current Codex workflow.
- Create projects and chats without leaving VS Code.
- Send the current selection or the whole file into the active chat with metadata.

## Install

The easiest path is GitHub Releases:

1. Download `codex-project-bridge-<version>.vsix` from the latest release.
2. In VS Code, run `Extensions: Install from VSIX...`.
3. Sign in inside the extension.
4. Save a personal provider API key inside the extension.

## Settings

- `codexBridge.baseUrl` - backend URL, default `http://62.109.2.121:3030`
- `codexBridge.userEmail` - last signed-in email
- `codexBridge.defaultProjectId` - active project id
- `codexBridge.defaultChatId` - active chat id

## Commands

- `Codex Bridge: Register`
- `Codex Bridge: Sign In`
- `Codex Bridge: Log Out`
- `Codex Bridge: Configure Model API Key`
- `Codex Bridge: Refresh`
- `Codex Bridge: Pick Project`
- `Codex Bridge: Pick Chat`
- `Codex Bridge: Create Project`
- `Codex Bridge: Create Chat`
- `Codex Bridge: Send Selection to Chat`
