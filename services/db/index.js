// db/index.js
import pkg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL pool connected");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected database error:", err);
  process.exit(-1);
});

// Graceful shutdown (important in production)
process.on("SIGINT", async () => {
  await pool.end();
  console.log("🧹 PostgreSQL pool closed");
  process.exit(0);
});

export default pool;
