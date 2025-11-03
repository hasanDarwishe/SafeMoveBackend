import { betterAuth, BetterAuthOptions, InferUser, User } from "better-auth";
import { configDotenv } from "dotenv";
import { createPool } from "mysql2/promise";

configDotenv();

export const auth = betterAuth({
  database: createPool({
    user: "root",
    password: "",
    database: "safeMove",
    host: "localhost",
  }),
  emailAndPassword: {
    enabled: true,
  },
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  user: {
    additionalFields: {
      actor: {
        type: "string",
        required: false
      },
      activated: {
        type: "boolean",
        required: false,
      }
    },
  }
});

export type UserData = User & {
  actor?: "user" | "volunteer" | "organizer" | "admin",
  activated?: boolean
}