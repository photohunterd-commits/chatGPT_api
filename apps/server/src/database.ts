import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { config, type ReasoningEffort } from "./config.js";

export type ChatRole = "user" | "assistant";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

interface UserRow extends PublicUser {
  passwordHash: string;
}

interface PasswordResetTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface UsageEventRecord {
  id: string;
  userId: string;
  chatId: string;
  model: string;
  periodMonth: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  inputCostRub: number;
  cachedInputCostRub: number;
  outputCostRub: number;
  webSearchCostRub: number;
  totalCostRub: number;
  createdAt: string;
}

export interface MonthlyBillingSummary {
  periodMonth: string;
  requestCount: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  webSearchCalls: number;
  inputCostRub: number;
  cachedInputCostRub: number;
  outputCostRub: number;
  webSearchCostRub: number;
  totalCostRub: number;
}

export interface ProjectRecord {
  id: string;
  userId: string;
  name: string;
  description: string;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSummary extends ProjectRecord {
  chatCount: number;
  lastMessageAt: string | null;
}

export interface ChatRecord {
  id: string;
  projectId: string;
  title: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
}

export interface MessageRecord {
  id: string;
  chatId: string;
  role: ChatRole;
  content: string;
  source: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

type MessageRow = Omit<MessageRecord, "metadata"> & {
  metadata_json: string | null;
};

export class AppDatabase {
  private readonly db: Database.Database;

  constructor() {
    const dbPath = join(config.dataDir, "workspace.sqlite");
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        reasoning_effort TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        model TEXT NOT NULL,
        period_month TEXT NOT NULL,
        input_tokens INTEGER NOT NULL,
        cached_input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        web_search_calls INTEGER NOT NULL,
        input_cost_rub REAL NOT NULL,
        cached_input_cost_rub REAL NOT NULL,
        output_cost_rub REAL NOT NULL,
        web_search_cost_rub REAL NOT NULL,
        total_cost_rub REAL NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
      CREATE INDEX IF NOT EXISTS idx_chats_project_id ON chats(project_id);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
      CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at ON messages(chat_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
      CREATE INDEX IF NOT EXISTS idx_usage_events_user_period ON usage_events(user_id, period_month);
      CREATE INDEX IF NOT EXISTS idx_usage_events_chat_id ON usage_events(chat_id);
      CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at);
    `);

    const projectColumns = this.db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;

    if (!projectColumns.some((column) => column.name === "user_id")) {
      this.db.exec("ALTER TABLE projects ADD COLUMN user_id TEXT REFERENCES users(id)");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)");
    }
  }

  createUser(input: { name: string; email: string; passwordHash: string }): PublicUser {
    const now = new Date().toISOString();
    const user = {
      id: randomUUID(),
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `
        INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
        VALUES (@id, @name, @email, @passwordHash, @createdAt, @updatedAt)
      `
      )
      .run(user);

    return this.toPublicUser(user);
  }

  findUserByEmail(email: string): UserRow | null {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          name,
          email,
          password_hash AS passwordHash,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM users
        WHERE email = ?
      `
      )
      .get(email.trim().toLowerCase()) as UserRow | undefined;

    return row ?? null;
  }

  getUserCredentials(userId: string): UserRow | null {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          name,
          email,
          password_hash AS passwordHash,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM users
        WHERE id = ?
      `
      )
      .get(userId) as UserRow | undefined;

    return row ?? null;
  }

  getUser(userId: string): PublicUser | null {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          name,
          email,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM users
        WHERE id = ?
      `
      )
      .get(userId) as PublicUser | undefined;

    return row ?? null;
  }

  updateUserPassword(userId: string, passwordHash: string) {
    const now = new Date().toISOString();

    this.db
      .prepare(
        `
        UPDATE users
        SET password_hash = ?, updated_at = ?
        WHERE id = ?
      `
      )
      .run(passwordHash, now, userId);

    return this.getUser(userId);
  }

  createPasswordResetToken(input: { expiresAt: string; tokenHash: string; userId: string }) {
    const token: PasswordResetTokenRow = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `
        INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
        VALUES (@id, @userId, @tokenHash, @expiresAt, @usedAt, @createdAt)
      `
      )
      .run(token);

    return token;
  }

  findPasswordResetToken(tokenHash: string) {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          user_id AS userId,
          token_hash AS tokenHash,
          expires_at AS expiresAt,
          used_at AS usedAt,
          created_at AS createdAt
        FROM password_reset_tokens
        WHERE token_hash = ?
      `
      )
      .get(tokenHash) as PasswordResetTokenRow | undefined;

    if (!row) {
      return null;
    }

    if (row.usedAt) {
      return null;
    }

    if (new Date(row.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    return row;
  }

  markPasswordResetTokenUsed(tokenId: string) {
    this.db
      .prepare(
        `
        UPDATE password_reset_tokens
        SET used_at = ?
        WHERE id = ?
      `
      )
      .run(new Date().toISOString(), tokenId);
  }

  invalidatePasswordResetTokensForUser(userId: string) {
    this.db
      .prepare(
        `
        UPDATE password_reset_tokens
        SET used_at = COALESCE(used_at, ?)
        WHERE user_id = ?
      `
      )
      .run(new Date().toISOString(), userId);
  }

  createUsageEvent(
    input: Omit<UsageEventRecord, "createdAt" | "id" | "periodMonth"> & { createdAt?: string; periodMonth?: string }
  ) {
    const usageEvent: UsageEventRecord = {
      id: randomUUID(),
      userId: input.userId,
      chatId: input.chatId,
      model: input.model.trim(),
      periodMonth: input.periodMonth ?? getBillingPeriodMonth(),
      inputTokens: input.inputTokens,
      cachedInputTokens: input.cachedInputTokens,
      outputTokens: input.outputTokens,
      webSearchCalls: input.webSearchCalls,
      inputCostRub: input.inputCostRub,
      cachedInputCostRub: input.cachedInputCostRub,
      outputCostRub: input.outputCostRub,
      webSearchCostRub: input.webSearchCostRub,
      totalCostRub: input.totalCostRub,
      createdAt: input.createdAt ?? new Date().toISOString()
    };

    this.db
      .prepare(
        `
        INSERT INTO usage_events (
          id,
          user_id,
          chat_id,
          model,
          period_month,
          input_tokens,
          cached_input_tokens,
          output_tokens,
          web_search_calls,
          input_cost_rub,
          cached_input_cost_rub,
          output_cost_rub,
          web_search_cost_rub,
          total_cost_rub,
          created_at
        )
        VALUES (
          @id,
          @userId,
          @chatId,
          @model,
          @periodMonth,
          @inputTokens,
          @cachedInputTokens,
          @outputTokens,
          @webSearchCalls,
          @inputCostRub,
          @cachedInputCostRub,
          @outputCostRub,
          @webSearchCostRub,
          @totalCostRub,
          @createdAt
        )
      `
      )
      .run(usageEvent);

    return usageEvent;
  }

  getMonthlyBillingSummary(userId: string, periodMonth = getBillingPeriodMonth()): MonthlyBillingSummary {
    const row = this.db
      .prepare(
        `
        SELECT
          COUNT(*) AS requestCount,
          COALESCE(SUM(input_tokens), 0) AS inputTokens,
          COALESCE(SUM(cached_input_tokens), 0) AS cachedInputTokens,
          COALESCE(SUM(output_tokens), 0) AS outputTokens,
          COALESCE(SUM(web_search_calls), 0) AS webSearchCalls,
          COALESCE(SUM(input_cost_rub), 0) AS inputCostRub,
          COALESCE(SUM(cached_input_cost_rub), 0) AS cachedInputCostRub,
          COALESCE(SUM(output_cost_rub), 0) AS outputCostRub,
          COALESCE(SUM(web_search_cost_rub), 0) AS webSearchCostRub,
          COALESCE(SUM(total_cost_rub), 0) AS totalCostRub
        FROM usage_events
        WHERE user_id = ? AND period_month = ?
      `
      )
      .get(userId, periodMonth) as Omit<MonthlyBillingSummary, "periodMonth"> | undefined;

    return {
      periodMonth,
      requestCount: Number(row?.requestCount ?? 0),
      inputTokens: Number(row?.inputTokens ?? 0),
      cachedInputTokens: Number(row?.cachedInputTokens ?? 0),
      outputTokens: Number(row?.outputTokens ?? 0),
      webSearchCalls: Number(row?.webSearchCalls ?? 0),
      inputCostRub: Number(row?.inputCostRub ?? 0),
      cachedInputCostRub: Number(row?.cachedInputCostRub ?? 0),
      outputCostRub: Number(row?.outputCostRub ?? 0),
      webSearchCostRub: Number(row?.webSearchCostRub ?? 0),
      totalCostRub: Number(row?.totalCostRub ?? 0)
    };
  }

  listProjects(userId: string): ProjectSummary[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          p.id,
          p.user_id AS userId,
          p.name,
          p.description,
          p.system_prompt AS systemPrompt,
          p.created_at AS createdAt,
          p.updated_at AS updatedAt,
          COUNT(DISTINCT c.id) AS chatCount,
          MAX(m.created_at) AS lastMessageAt
        FROM projects p
        LEFT JOIN chats c ON c.project_id = p.id
        LEFT JOIN messages m ON m.chat_id = c.id
        WHERE p.user_id = ?
        GROUP BY p.id
        ORDER BY COALESCE(MAX(m.created_at), p.updated_at) DESC, p.name ASC
      `
      )
      .all(userId) as Array<ProjectSummary>;

    return rows.map((row) => ({
      ...row,
      chatCount: Number(row.chatCount)
    }));
  }

  createProject(userId: string, input: { name: string; description?: string; systemPrompt?: string }): ProjectRecord {
    const now = new Date().toISOString();
    const project: ProjectRecord = {
      id: randomUUID(),
      userId,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      systemPrompt: input.systemPrompt?.trim() ?? "",
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `
        INSERT INTO projects (id, user_id, name, description, system_prompt, created_at, updated_at)
        VALUES (@id, @userId, @name, @description, @systemPrompt, @createdAt, @updatedAt)
      `
      )
      .run(project);

    return project;
  }

  updateProject(
    userId: string,
    projectId: string,
    input: { name?: string; description?: string; systemPrompt?: string }
  ) {
    const current = this.getProject(userId, projectId);

    if (!current) {
      return null;
    }

    const updated: ProjectRecord = {
      ...current,
      name: input.name?.trim() || current.name,
      description: input.description?.trim() ?? current.description,
      systemPrompt: input.systemPrompt?.trim() ?? current.systemPrompt,
      updatedAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `
        UPDATE projects
        SET name = @name,
            description = @description,
            system_prompt = @systemPrompt,
            updated_at = @updatedAt
        WHERE id = @id AND user_id = @userId
      `
      )
      .run(updated);

    return updated;
  }

  getProject(userId: string, projectId: string): ProjectRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          user_id AS userId,
          name,
          description,
          system_prompt AS systemPrompt,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM projects
        WHERE id = ? AND user_id = ?
      `
      )
      .get(projectId, userId) as ProjectRecord | undefined;

    return row ?? null;
  }

  listChats(userId: string, projectId: string): ChatRecord[] {
    return this.db
      .prepare(
        `
        SELECT
          c.id,
          c.project_id AS projectId,
          c.title,
          c.model,
          c.reasoning_effort AS reasoningEffort,
          c.created_at AS createdAt,
          c.updated_at AS updatedAt,
          MAX(m.created_at) AS lastMessageAt
        FROM chats c
        INNER JOIN projects p ON p.id = c.project_id
        LEFT JOIN messages m ON m.chat_id = c.id
        WHERE c.project_id = ? AND p.user_id = ?
        GROUP BY c.id
        ORDER BY COALESCE(MAX(m.created_at), c.updated_at) DESC, c.created_at DESC
      `
      )
      .all(projectId, userId) as ChatRecord[];
  }

  createChat(
    _userId: string,
    projectId: string,
    input: { title?: string; model?: string; reasoningEffort?: ReasoningEffort }
  ): ChatRecord {
    const now = new Date().toISOString();
    const chat: Omit<ChatRecord, "lastMessageAt"> = {
      id: randomUUID(),
      projectId,
      title: input.title?.trim() || "New chat",
      model: input.model ?? config.openAiModel,
      reasoningEffort: input.reasoningEffort ?? config.openAiReasoningEffort,
      createdAt: now,
      updatedAt: now
    };

    this.db
      .prepare(
        `
        INSERT INTO chats (id, project_id, title, model, reasoning_effort, created_at, updated_at)
        VALUES (@id, @projectId, @title, @model, @reasoningEffort, @createdAt, @updatedAt)
      `
      )
      .run(chat);

    return {
      ...chat,
      lastMessageAt: null
    };
  }

  getChat(userId: string, chatId: string): ChatRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          c.id,
          c.project_id AS projectId,
          c.title,
          c.model,
          c.reasoning_effort AS reasoningEffort,
          c.created_at AS createdAt,
          c.updated_at AS updatedAt,
          MAX(m.created_at) AS lastMessageAt
        FROM chats c
        INNER JOIN projects p ON p.id = c.project_id
        LEFT JOIN messages m ON m.chat_id = c.id
        WHERE c.id = ? AND p.user_id = ?
        GROUP BY c.id
      `
      )
      .get(chatId, userId) as ChatRecord | undefined;

    return row ?? null;
  }

  listMessages(userId: string, chatId: string): MessageRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          m.id,
          m.chat_id AS chatId,
          m.role,
          m.content,
          m.source,
          m.metadata_json,
          m.created_at AS createdAt
        FROM messages m
        INNER JOIN chats c ON c.id = m.chat_id
        INNER JOIN projects p ON p.id = c.project_id
        WHERE m.chat_id = ? AND p.user_id = ?
        ORDER BY m.created_at ASC
      `
      )
      .all(chatId, userId) as MessageRow[];

    return rows.map((row) => this.mapMessage(row));
  }

  addMessage(input: {
    chatId: string;
    role: ChatRole;
    content: string;
    source?: string;
    metadata?: Record<string, unknown> | null;
  }): MessageRecord {
    const message = {
      id: randomUUID(),
      chatId: input.chatId,
      role: input.role,
      content: input.content.trim(),
      source: input.source ?? "app",
      metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: new Date().toISOString()
    };

    this.db
      .prepare(
        `
        INSERT INTO messages (id, chat_id, role, content, source, metadata_json, created_at)
        VALUES (@id, @chatId, @role, @content, @source, @metadata_json, @createdAt)
      `
      )
      .run(message);

    this.db
      .prepare(
        `
        UPDATE chats
        SET updated_at = @updatedAt
        WHERE id = @chatId
      `
      )
      .run({
        chatId: input.chatId,
        updatedAt: message.createdAt
      });

    return this.mapMessage(message);
  }

  private mapMessage(row: MessageRow): MessageRecord {
    return {
      id: row.id,
      chatId: row.chatId,
      role: row.role,
      content: row.content,
      source: row.source,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
      createdAt: row.createdAt
    };
  }

  private toPublicUser(user: UserRow | {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    updatedAt: string;
  }): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };
  }
}

function getBillingPeriodMonth(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.billing.timezone,
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear().toString();
  const month = parts.find((part) => part.type === "month")?.value ?? String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}
