import { betterAuth, BetterAuthOptions, InferUser, User } from "better-auth";
import { configDotenv } from "dotenv";
import { Pool } from "pg"; // Changed from mysql2/promise to pg

configDotenv();

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
        required: false,
        defaultValue: "user" // Add default value
      },
      activated: {
        type: "boolean",
        required: false,
        defaultValue: true // Add default value
      }
    },
  }
});

export type UserData = User & {
  actor?: "user" | "volunteer" | "organizer" | "admin",
  activated?: boolean
}