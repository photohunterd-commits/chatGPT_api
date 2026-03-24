# Codex Project Bridge

Codex Project Bridge connects VS Code to the shared workspace backend while defaulting new VS Code chats to `gpt-5-mini` for a much lower cost than the desktop app.

## Features

- Register and sign in to a private backend user account.
- Store the model API key locally in VS Code Secret Storage.
- Use a Codex-style dark overview panel with current spend, active project, and active chat.
- Browse backend projects and chats from the activity bar.
- Pick an active project or chat for the current Codex workflow.
- Create projects and chats without leaving VS Code.
- Send the current selection or the whole file into the active chat with metadata.
- Show the signed-in user's current monthly spend and stop new requests when the server budget is exhausted.

## Install

The easiest path is GitHub Releases:

1. Download `codex-project-bridge-<version>.vsix` from the latest release.
2. In VS Code, run `Extensions: Install from VSIX...`.
3. Sign in inside the extension.
4. Save a personal provider API key inside the extension.

The extension already has the backend URL built in, so users only need to sign in and save a personal provider API key.

## Settings

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
