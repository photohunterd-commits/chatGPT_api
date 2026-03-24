import type { PublicUser } from "./database.js";

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
    }
  }
}

export {};
