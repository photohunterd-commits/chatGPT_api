import cors from "cors";
import express from "express";
import { z } from "zod";
import { createAuthToken, hashPassword, verifyAuthToken, verifyPassword } from "./auth.js";
import { AppDatabase } from "./database.js";
import { config } from "./config.js";
import { ProviderApiError, generateAssistantReply } from "./openai.js";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200)
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200)
});

const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  systemPrompt: z.string().trim().max(5000).optional()
});

const projectPatchSchema = projectSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  "At least one field is required."
);

const chatSchema = z.object({
  title: z.string().trim().max(120).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional()
});

const messageSchema = z.object({
  content: z.string().trim().min(1).max(30000),
  source: z.string().trim().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional()
});

export function createApp(database = new AppDatabase()) {
  const app = express();

  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      model: config.openAiModel
    });
  });

  app.post("/auth/register", async (request, response) => {
    const payload = registerSchema.parse(request.body);

    if (database.findUserByEmail(payload.email)) {
      response.status(409).json({
        error: "A user with this email already exists."
      });
      return;
    }

    const passwordHash = await hashPassword(payload.password);
    const user = database.createUser({
      name: payload.name,
      email: payload.email,
      passwordHash
    });

    response.status(201).json({
      token: createAuthToken(user),
      user
    });
  });

  app.post("/auth/login", async (request, response) => {
    const payload = loginSchema.parse(request.body);
    const user = database.findUserByEmail(payload.email);

    if (!user || !(await verifyPassword(payload.password, user.passwordHash))) {
      response.status(401).json({
        error: "Invalid email or password."
      });
      return;
    }

    const publicUser = database.getUser(user.id);

    if (!publicUser) {
      response.status(404).json({
        error: "User not found."
      });
      return;
    }

    response.json({
      token: createAuthToken(publicUser),
      user: publicUser
    });
  });

  app.use("/api", (request, response, next) => {
    const authorization = request.header("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      response.status(401).json({
        error: "Authentication required."
      });
      return;
    }

    try {
      const userId = verifyAuthToken(token);
      const user = database.getUser(userId);

      if (!user) {
        response.status(401).json({
          error: "User session is no longer valid."
        });
        return;
      }

      request.user = user;
      next();
    } catch {
      response.status(401).json({
        error: "Authentication required."
      });
    }
  });

  app.get("/api/me", (request, response) => {
    response.json({
      user: request.user
    });
  });

  app.get("/api/config", (_request, response) => {
    response.json({
      defaultModel: config.openAiModel,
      defaultReasoningEffort: config.openAiReasoningEffort,
      providerKeyMode: config.openAiApiKey ? "user_or_server_fallback" : "user_required"
    });
  });

  app.get("/api/projects", (request, response) => {
    response.json({
      items: database.listProjects(request.user!.id)
    });
  });

  app.post("/api/projects", (request, response) => {
    const payload = projectSchema.parse(request.body);
    const project = database.createProject(request.user!.id, payload);

    response.status(201).json(project);
  });

  app.patch("/api/projects/:projectId", (request, response) => {
    const payload = projectPatchSchema.parse(request.body);
    const project = database.updateProject(request.user!.id, request.params.projectId, payload);

    if (!project) {
      response.status(404).json({
        error: "Project not found"
      });
      return;
    }

    response.json(project);
  });

  app.get("/api/projects/:projectId/chats", (request, response) => {
    const project = database.getProject(request.user!.id, request.params.projectId);

    if (!project) {
      response.status(404).json({
        error: "Project not found"
      });
      return;
    }

    response.json({
      project,
      items: database.listChats(request.user!.id, request.params.projectId)
    });
  });

  app.post("/api/projects/:projectId/chats", (request, response) => {
    const project = database.getProject(request.user!.id, request.params.projectId);

    if (!project) {
      response.status(404).json({
        error: "Project not found"
      });
      return;
    }

    const payload = chatSchema.parse(request.body);
    const chat = database.createChat(request.user!.id, request.params.projectId, payload);

    response.status(201).json(chat);
  });

  app.get("/api/chats/:chatId/messages", (request, response) => {
    const chat = database.getChat(request.user!.id, request.params.chatId);

    if (!chat) {
      response.status(404).json({
        error: "Chat not found"
      });
      return;
    }

    response.json({
      chat,
      items: database.listMessages(request.user!.id, request.params.chatId)
    });
  });

  app.post("/api/chats/:chatId/messages", async (request, response) => {
    const chat = database.getChat(request.user!.id, request.params.chatId);

    if (!chat) {
      response.status(404).json({
        error: "Chat not found"
      });
      return;
    }

    const project = database.getProject(request.user!.id, chat.projectId);

    if (!project) {
      response.status(404).json({
        error: "Project not found"
      });
      return;
    }

    const payload = messageSchema.parse(request.body);
    const userMessage = database.addMessage({
      chatId: chat.id,
      role: "user",
      content: payload.content,
      source: payload.source,
      metadata: payload.metadata ?? null
    });

    const history = database
      .listMessages(request.user!.id, chat.id)
      .slice(-30)
      .map((message) => ({
        role: message.role,
        content: message.content
      }));

    const assistantText = await generateAssistantReply({
      apiKey: request.header("x-provider-api-key") ?? undefined,
      instructions: project.systemPrompt,
      messages: history,
      model: chat.model,
      reasoningEffort: chat.reasoningEffort
    });

    const assistantMessage = database.addMessage({
      chatId: chat.id,
      role: "assistant",
      content: assistantText,
      source: "openai"
    });

    response.status(201).json({
      userMessage,
      assistantMessage
    });
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      response.status(400).json({
        error: "Validation failed",
        issues: error.issues
      });
      return;
    }

    if (error instanceof ProviderApiError) {
      response.status(error.statusCode).json({
        error: error.message,
        code: error.code
      });
      return;
    }

    console.error(error);

    response.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  });

  return app;
}
