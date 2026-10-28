import { defineConfig } from "drizzle-kit";
export default defineConfig({ dialect: "postgresql", schema: "./src/db/schema.ts", out: "./drizzle", dbCredentials: { url: process.env.FORDNET_DATABASE_URL_UNPOOLED ?? process.env.FORDNET_DATABASE_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" } });
