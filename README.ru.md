# GPT-5.4 Workspace

Русская инструкция по установке, релизам, локальной сборке и деплою проекта.

## Самый простой путь для пользователя

Пользователю больше не нужно собирать приложение вручную.

1. Откройте `Releases` в этом репозитории.
2. Скачайте установщик `gpt54-workspace-setup-<версия>.exe`.
3. Установите и запустите приложение.
4. Зарегистрируйтесь или войдите уже внутри приложения.
5. Введите свой personal API key от провайдера модели уже внутри приложения.

Desktop-приложение уже преднастроено на рабочий backend:

```text
http://62.109.2.121:3030
```

То есть пользователю не нужно вручную прописывать адрес сервера в базовом сценарии.

Если нужен VS Code:

1. Скачайте из того же релиза файл `codex-project-bridge-<версия>.vsix`.
2. В VS Code выберите `Extensions: Install from VSIX...`.
3. Войдите в аккаунт внутри расширения.
4. Сохраните свой personal API key внутри расширения.

Если ключ невалидный, закончился баланс, превышена квота или провайдер не отвечает, и desktop-приложение, и расширение показывают понятное уведомление.

## Что находится в репозитории

1. `apps/server` - backend на Node.js/TypeScript с SQLite, регистрацией пользователей и приватными чатами.
2. `apps/windows-client/ChatGptApi.Desktop` - нативное Windows-приложение на WPF.
3. `apps/vscode-codex` - расширение VS Code для работы с проектами и чатами через Codex workflow.
4. `scripts` - скрипты публикации desktop-приложения, сборки установщика и деплоя сервера.
5. `.github/workflows/release.yml` - GitHub Actions workflow для сборки релизных артефактов.

## Как устроена безопасность

- У каждого пользователя свой аккаунт.
- Проекты, чаты и сообщения видны только авторизованному пользователю.
- Ключ к модели не хранится в git.
- Ключ к модели вводится отдельно в Windows-приложении и отдельно в VS Code.
- Backend принимает ключ провайдера в заголовке запроса, поэтому общий публичный ключ для всех пользователей не нужен.
- Если ключ невалидный, закончился баланс или превышена квота, backend возвращает понятную ошибку.

## Локальный запуск для разработки

1. Скопируйте `.env.example` в `.env`.
2. Укажите длинный случайный `JWT_SECRET`.
3. Если используете AITUNNEL-ключи вида `sk-aitunnel-...`, задайте:

```env
OPENAI_BASE_URL=https://api.aitunnel.ru/v1
```

4. Если каждый пользователь вводит свой ключ сам, оставьте:

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

## Сборка desktop-приложения и установщика

Публикация self-contained desktop-клиента:

```powershell
npm.cmd run publish:desktop
```

Сборка установщика Inno Setup:

```powershell
npm.cmd run build:installer
```

На выходе получаются:

- `publish/windows-client/` - опубликованные файлы desktop-приложения
- `publish/installer/` - готовый `.exe`-установщик

Для локальной сборки установщика нужен `Inno Setup 6`.

## Сборка и установка расширения VS Code

Сборка:

```powershell
npm.cmd run build:vscode
```

Упаковка `.vsix`:

```powershell
npm.cmd run package:vscode
```

Готовый файл:

```text
apps/vscode-codex/codex-project-bridge-<версия>.vsix
```

Установка в VS Code:

1. Откройте VS Code.
2. Перейдите в Extensions.
3. Выберите `Install from VSIX...`.
4. Укажите файл `codex-project-bridge-<версия>.vsix`.

## Автоматическая сборка релиза на GitHub

Workflow находится в:

```text
.github/workflows/release.yml
```

Что делает workflow:

1. Собирает desktop-приложение.
2. Упаковывает расширение VS Code в `.vsix`.
3. Собирает Windows-установщик через Inno Setup.
4. Публикует GitHub Release при пуше тега вида `vX.Y.Z`.

Ожидаемые артефакты релиза:

- `gpt54-workspace-setup-<версия>.exe`
- `codex-project-bridge-<версия>.vsix`

Пример публикации релиза:

```powershell
git tag vX.Y.Z
git push origin vX.Y.Z
```

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
- `DATA_DIR` - папка с SQLite-базой

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

## Что уже проверено

- регистрация пользователя работает
- логин пользователя работает
- изоляция проектов и чатов между пользователями работает
- backend отвечает по health endpoint
- запросы к `gpt-5.4` проходят через OpenAI-compatible Responses API
- desktop-приложение собирается
- расширение VS Code собирается и упаковывается
- release workflow готовит артефакты для установщика и VSIX
