/**
 * Vercel Cron endpoint to keep SQLite Cloud database alive
 * Runs every 10 hours to prevent the database from sleeping
 * 
 * Cron schedule configured in vercel.json
 */

const { Database } = require("@sqlitecloud/drivers");

export default async (req, res) => {
  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify the cron request is from Vercel (optional security check)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Log but don't fail - Vercel crons don't always include auth header
    console.log("[KEEP-ALIVE] Warning: Invalid or missing cron auth header");
  }

  try {
    console.log("[KEEP-ALIVE] Starting database keep-alive ping...");

    // Connect to SQLite Cloud database
    const db = new Database(
      process.env.DATABASE_URL || "sqlitecloud://cxd2tnbwvk.g5.sqlite.cloud:8860/crimewise?apikey=euIjfRGcZnywBxr10nuXqdrk6BXamqJZvXRalZPVWVg"
    );

    // Send a simple query to keep connection alive
    const result = await db.sql`SELECT 1 as ping`;

    console.log("[KEEP-ALIVE] Database ping successful:", result);

    return res.status(200).json({
      success: true,
      message: "Database keep-alive ping sent successfully",
      timestamp: new Date().toISOString(),
      ping: result,
    });
  } catch (error) {
    console.error("[KEEP-ALIVE] Error during keep-alive ping:", error.message || error);

    return res.status(500).json({
      success: false,
      error: "Failed to ping database",
      message: error.message || "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
};
