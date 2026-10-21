import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/cabinet/schema.ts",
  out: "./src/db/cabinet/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://seotool:seotool@127.0.0.1:5432/seotool",
  },
  verbose: true,
  strict: true,
});
