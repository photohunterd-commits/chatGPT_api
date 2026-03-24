# GPT-5.4 Workspace

Russian guide: [README.ru.md](README.ru.md)

This repository contains three deliverables:

1. A server-side chat backend that stores users, projects, chats, and messages in SQLite and calls `gpt-5.4` through an OpenAI-compatible Responses API.
2. A native Windows WPF client for user registration, sign-in, private projects, and chats.
3. A VS Code utility extension for Codex workflows that sends code context into the signed-in user's chats.

## Structure

- `apps/server` - Node.js/TypeScript API with SQLite storage and OpenAI integration.
- `apps/windows-client/ChatGptApi.Desktop` - native WPF desktop client for Windows.
- `apps/vscode-codex` - VS Code extension for Codex-oriented project chat workflows.
- `scripts` - helper scripts for publishing the desktop app and deploying the server.

## Quick Start

1. Copy `.env.example` to `.env` and set `JWT_SECRET` to a long random value.
2. If you are using AITUNNEL keys (`sk-aitunnel-...`), set `OPENAI_BASE_URL=https://api.aitunnel.ru/v1`.
3. Leave `OPENAI_API_KEY` empty when each user should provide their own key from the desktop app or VS Code extension.
4. Run `npm.cmd install`.
5. Run `npm.cmd run dev:server`.
6. Build the VS Code extension with `npm.cmd run build:vscode`.
7. Publish the desktop app with `npm.cmd run publish:desktop`.

## Security Model

- Users register and sign in with their own accounts.
- Projects, chats, and messages are scoped to the authenticated user.
- The model API key is entered separately in the Windows app and the VS Code extension.
- The backend accepts a per-request provider key via header, so personal keys do not live in git.
- If the provider rejects the key or the balance is exhausted, the backend returns a user-friendly warning.

## Model Notes

As of March 24, 2026, OpenAI's official model docs list `gpt-5.4` as the flagship model for complex reasoning and coding via the Responses API.

Sources:
- https://developers.openai.com/api/docs/models
- https://developers.openai.com/api/docs/quickstart

## Deployment

The server is designed to run through Docker Compose on Ubuntu. See `docker-compose.yml` and `scripts/deploy-server.mjs`.
