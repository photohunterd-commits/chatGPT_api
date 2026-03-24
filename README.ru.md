# GPT-5.4 Workspace

Русская инструкция по запуску, деплою и использованию проекта.

## Что входит в репозиторий

1. `apps/server` - backend на Node.js/TypeScript с SQLite, регистрацией пользователей и приватными чатами.
2. `apps/windows-client/ChatGptApi.Desktop` - нативное Windows-приложение на WPF.
3. `apps/vscode-codex` - расширение VS Code для работы с проектами и чатами через Codex workflow.

## Как устроена безопасность

- У каждого пользователя свой аккаунт.
- Проекты, чаты и сообщения видны только авторизованному пользователю.
- Ключ к модели не хранится в git.
- Ключ к модели вводится отдельно в Windows-приложении и отдельно в VS Code.
- Backend принимает ключ провайдера в заголовке запроса, поэтому общий публичный ключ для всех пользователей не нужен.
- Если ключ невалидный, закончился баланс или превышена квота, backend возвращает понятную ошибку.

## Требования

- Windows 10/11 для desktop-клиента
- Node.js 20+
- npm 10+
- .NET 8 SDK для локальной сборки desktop-клиента
- Ubuntu + Docker Compose для сервера

## Быстрый локальный запуск

1. Скопируйте `.env.example` в `.env`.
2. Укажите в `.env` длинный случайный `JWT_SECRET`.
3. Если используете AITUNNEL-ключи вида `sk-aitunnel-...`, укажите:

```env
OPENAI_BASE_URL=https://api.aitunnel.ru/v1
```

4. Если каждый пользователь должен вводить свой ключ сам, оставьте:

```env
OPENAI_API_KEY=
```

5. Установите зависимости:

```powershell
npm.cmd install
```

6. Запустите backend:

```powershell
npm.cmd run dev:server
```

7. Проверьте health endpoint:

```text
GET /health
```

Ожидаемый ответ:

```json
{
  "status": "ok",
  "model": "gpt-5.4"
}
```

## Сборка Windows-приложения

Команда сборки готового self-contained `.exe`:

```powershell
npm.cmd run publish:desktop
```

Готовый файл появится в папке:

```text
publish/windows-client/ChatGptApi.Desktop.exe
```

Что делает приложение:

- позволяет зарегистрировать пользователя
- позволяет войти в аккаунт
- хранит токен входа и model API key локально на текущем Windows-профиле
- показывает проекты
- показывает чаты внутри проекта
- отправляет сообщения в `gpt-5.4`
- показывает предупреждение, если ключ не работает или закончился баланс

## Сборка и установка расширения VS Code

Сборка:

```powershell
npm.cmd run build:vscode
```

Упаковка `.vsix`:

```powershell
npm.cmd run package --workspace apps/vscode-codex
```

Готовый файл:

```text
apps/vscode-codex/codex-project-bridge-0.1.0.vsix
```

Установка в VS Code:

1. Откройте VS Code.
2. Перейдите в Extensions.
3. Выберите `Install from VSIX...`.
4. Укажите файл `codex-project-bridge-0.1.0.vsix`.

После установки:

1. Укажите `codexBridge.baseUrl`.
2. Зарегистрируйтесь или войдите.
3. Сохраните personal model API key через команду `Codex Bridge: Configure Model API Key`.
4. Выберите проект и чат.
5. Отправляйте выделенный код или файл в чат.

## Основные переменные окружения

Пример `.env`:

```env
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.aitunnel.ru/v1
OPENAI_MODEL=gpt-5.4
OPENAI_REASONING_EFFORT=medium
JWT_SECRET=replace-this-with-a-very-long-random-secret
PORT=3030
HOST=0.0.0.0
CORS_ORIGIN=*
DATA_DIR=./data
```

Пояснение:

- `OPENAI_API_KEY` - опционален, если ключи вводят сами пользователи
- `OPENAI_BASE_URL` - base URL OpenAI-совместимого провайдера
- `OPENAI_MODEL` - модель, сейчас `gpt-5.4`
- `OPENAI_REASONING_EFFORT` - `low`, `medium`, `high`, `xhigh`
- `JWT_SECRET` - секрет для пользовательских сессий
- `DATA_DIR` - папка с SQLite базой

## Деплой на Ubuntu-сервер

Проект рассчитан на запуск через Docker Compose.

### Вариант 1. Вручную

1. Установите Docker и Docker Compose.
2. Клонируйте репозиторий:

```bash
git clone https://github.com/photohunterd-commits/chatGPT_api.git
cd chatGPT_api
```

3. Создайте `.env`.
4. Создайте папку `data`.
5. Запустите:

```bash
docker compose up -d --build
```

6. Проверьте:

```bash
docker compose ps
curl http://127.0.0.1:3030/health
```

### Вариант 2. Через скрипт деплоя

Можно использовать:

```powershell
npm.cmd run deploy:server
```

Для этого нужны переменные среды на машине, откуда запускается деплой:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PASSWORD`
- `DEPLOY_HOST_KEY`

## Как пользователю начать работу

### В desktop-клиенте

1. Запустить приложение.
2. Указать `Backend URL`.
3. Ввести personal model API key.
4. Нажать `Register` или `Sign In`.
5. Создать проект.
6. Создать чат.
7. Отправить сообщение.

### В VS Code

1. Установить расширение.
2. Указать `codexBridge.baseUrl`.
3. Выполнить `Codex Bridge: Register` или `Codex Bridge: Sign In`.
4. Выполнить `Codex Bridge: Configure Model API Key`.
5. Создать или выбрать проект.
6. Создать или выбрать чат.
7. Отправлять код в чат командой `Codex Bridge: Send Selection to Chat`.

## Где лежат данные

- SQLite база хранится в папке `data`
- пользовательские проекты и чаты лежат в этой базе
- токен входа и ключ модели не коммитятся в git

## Что уже проверено

- регистрация пользователя работает
- логин пользователя работает
- изоляция проектов и чатов между пользователями работает
- backend отвечает по health endpoint
- запросы к `gpt-5.4` проходят через OpenAI-compatible Responses API
- desktop-приложение собирается
- VS Code расширение собирается и упаковывается

## Ссылки

- OpenAI Models: https://developers.openai.com/api/docs/models
- OpenAI Quickstart: https://developers.openai.com/api/docs/quickstart
