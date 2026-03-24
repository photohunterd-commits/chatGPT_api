# GPT-5.4 Workspace

Russian guide: [README.ru.md](README.ru.md)

This repository contains:

1. A multi-user chat backend with private projects, chats, and SQLite storage.
2. A native Windows desktop client for registration, sign-in, project management, and chat.
3. A VS Code extension for Codex-oriented workflows that connects to the same private workspace.

## End-User Install

The recommended path for users is GitHub Releases:

1. Open the latest release in this repository.
2. Download `gpt54-workspace-setup-<version>.exe`.
3. Install and launch the desktop app.
4. Register or sign in inside the app.
5. Enter a personal provider API key inside the app before sending messages.

The desktop app is preconfigured to use the hosted backend at `http://62.109.2.121:3030`, so users do not need to build or configure anything for the basic flow.

If a user also works from VS Code:

1. Download `codex-project-bridge-<version>.vsix` from the same release.
2. Install it with `Extensions: Install from VSIX...`.
3. Sign in and save a personal provider API key inside the extension.

Both clients show a clear warning when the provider rejects the key, the quota is exceeded, or the balance is exhausted.

## Structure

- `apps/server` - Node.js/TypeScript API with SQLite storage and OpenAI-compatible Responses API calls.
- `apps/windows-client/ChatGptApi.Desktop` - native WPF desktop client for Windows.
- `apps/vscode-codex` - VS Code extension for Codex-oriented project chat workflows.
- `scripts` - helper scripts for publishing the desktop app, building the installer, and deploying the server.
- `.github/workflows/release.yml` - GitHub Actions workflow that builds release assets.

## Local Development

1. Copy `.env.example` to `.env`.
2. Set a long random `JWT_SECRET`.
3. If you use AITUNNEL keys (`sk-aitunnel-...`), set `OPENAI_BASE_URL=https://api.aitunnel.ru/v1`.
4. Leave `OPENAI_API_KEY` empty when each user should bring their own key.
5. Run `npm.cmd install`.
6. Run `npm.cmd run dev:server`.

Useful build commands:

- `npm.cmd run build:vscode`
- `npm.cmd run package:vscode`
- `npm.cmd run publish:desktop`
- `npm.cmd run build:installer`

## Automated Releases

The release workflow is in [`.github/workflows/release.yml`](.github/workflows/release.yml).

- Pushing a tag like `vX.Y.Z` builds the Windows desktop publish output.
- The workflow packages the VS Code extension as `.vsix`.
- The workflow compiles an Inno Setup installer.
- GitHub Release assets are published automatically for tagged builds.

Expected release assets:

- `gpt54-workspace-setup-<version>.exe`
- `codex-project-bridge-<version>.vsix`

## Security Model

- Users register and sign in with their own accounts.
- Projects, chats, and messages are scoped to the authenticated user.
- The provider API key is entered separately in the desktop app and the VS Code extension.
- The backend accepts a per-request provider key via header, so personal keys do not live in git.
- If the provider rejects the key or the balance is exhausted, the backend returns a user-friendly warning.

## Deployment

The server runs through Docker Compose on Ubuntu. See `docker-compose.yml` and `scripts/deploy-server.mjs`.
