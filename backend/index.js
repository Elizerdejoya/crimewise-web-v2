require('dotenv').config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 5000;

// Improved CORS configuration to handle redirects
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:3000",
      "http://localhost:4173",
      "https://crimewise-web-v2.vercel.app",
      "https://crimewise-web-v2-ri4n.vercel.app",
      "https://crimewisesys-yelj.vercel.app",
      "https://crimewisesys.vercel.app",
      "https://crimewise.vercel.app",
      "https://crimewise-backend.vercel.app"
    ];

    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      process.env.NODE_ENV !== "production"
    ) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

// Apply CORS first, before any other middleware
app.use(cors(corsOptions));

// Remove any trailing slashes to prevent redirect CORS issues
app.use((req, res, next) => {
  if (req.path.slice(-1) === "/" && req.path.length > 1) {
    const query = req.url.slice(req.path.length);
    res.redirect(301, req.path.slice(0, -1) + query);
  } else {
    next();
  }
});

app.use(express.json());

// Modularized database and routes
const db = require("./db");
const batchesRoutes = require("./routes/batches");
const coursesRoutes = require("./routes/courses");
const classesRoutes = require("./routes/classes");
const instructorsRoutes = require("./routes/instructors");
const studentsRoutes = require("./routes/students");
const usersRoutes = require("./routes/users");
const homeRoutes = require("./routes/home");
const relationsRoutes = require("./routes/relations");
const questionsRouter = require("./routes/questions");
const examsRoutes = require("./routes/exams");
const organizationsRoutes = require("./routes/organizations");
const subscriptionsRoutes = require("./routes/subscriptions");
const chatbotRoutes = require("./routes/chatbot");
const keywordPoolsRoutes = require("./routes/keyword-pools");
const contactRoutes = require("./routes/contact");
const aiGraderRoutes = require("./routes/ai-grader");
const apiKeyManager = require("./apiKeyManager");

// Mount modular routes
app.use("/api/batches", batchesRoutes);
app.use("/api/courses", coursesRoutes);
app.use("/api/classes", classesRoutes);
app.use("/api/instructors", instructorsRoutes);
app.use("/api/students", studentsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/relations", relationsRoutes);
app.use("/api/exams", examsRoutes);
app.use("/api/organizations", organizationsRoutes);
app.use("/api/subscriptions", subscriptionsRoutes);
app.use("/api/chatbot", chatbotRoutes);
app.use("/api/ai-grader", aiGraderRoutes);
app.use("/api", keywordPoolsRoutes);
app.use("/api", questionsRouter);
app.use("/api", contactRoutes);
app.use("/", homeRoutes);

app.use(express.static(path.join(__dirname, "../frontend/dist")));

app.get("/test", (req, res) => {
  res.json({
    message: "Hello World",
    code: 200,
  });
});

// API Key usage monitoring endpoint for AI grader
app.get("/api/monitor/api-keys", (req, res) => {
  try {
    const stats = apiKeyManager.getStats();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      apiKeyStats: stats,
      message: `Using ${stats.totalKeys} API keys for AI grading with ${stats.totalCapacityRPM} RPM capacity`
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to get API key stats",
      details: err && err.message ? err.message : err
    });
  }
});

// AI Worker status endpoint
app.get("/api/monitor/ai-worker", async (req, res) => {
  try {
    const pendingCount = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'pending'`;
    const processingCount = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'processing'`;
    const doneCount = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'done'`;
    const errorCount = await db.sql`SELECT COUNT(*) as count FROM ai_queue WHERE status = 'error'`;
    
    const pendingNum = pendingCount && pendingCount[0] ? Number(pendingCount[0].count || 0) : 0;
    const processingNum = processingCount && processingCount[0] ? Number(processingCount[0].count || 0) : 0;
    const doneNum = doneCount && doneCount[0] ? Number(doneCount[0].count || 0) : 0;
    const errorNum = errorCount && errorCount[0] ? Number(errorCount[0].count || 0) : 0;
    
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      aiWorkerQueue: {
        pending: pendingNum,
        processing: processingNum,
        done: doneNum,
        error: errorNum,
        total: pendingNum + processingNum + doneNum + errorNum
      },
      configuration: {
        maxConcurrency: 6,
        rpmPerKey: 8,
        totalRPM: 48,
        minDelayMs: 7500
      }
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to get AI worker status",
      details: err && err.message ? err.message : err
    });
  }
});

// Aggregated AI grades by API key index
app.get('/api/monitor/ai-grades-by-key', async (req, res) => {
  try {
    const rows = await db.sql`SELECT api_key_index, COUNT(*) as count, AVG(score) as avg_score FROM ai_grades GROUP BY api_key_index ORDER BY api_key_index`;
    res.json({ status: 'ok', timestamp: new Date().toISOString(), data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to aggregate grades by API key', details: err && err.message ? err.message : err });
  }
});

// Trigger AI worker to process pending jobs (for serverless/Vercel compatibility)
app.post('/api/trigger-ai-worker', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 6);
    const aiWorker = require('./ai-worker');
    const processed = await aiWorker.runOnce(limit);
    res.json({ 
      status: 'ok',
      processed,
      message: `Processed ${processed} job(s)`
    });
  } catch (err) {
    console.error('[TRIGGER-WORKER] Error:', err && err.message ? err.message : err);
    res.status(500).json({
      error: 'Failed to trigger worker',
      details: err && err.message ? err.message : err
    });
  }
});

// Health check endpoint for Vercel
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Serve frontend for non-API routes (only in non-serverless environment)
if (process.env.NODE_ENV !== "production") {
  app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/dist", "index.html"));
  });
}

// Initialize database on first request (serverless-friendly approach)
let dbInitialized = false;
app.use(async (req, res, next) => {
  // Skip for health/test endpoints
  if (req.path === "/health" || req.path === "/test") {
    return next();
  }

  if (!dbInitialized) {
    try {
      console.log("[API] Waiting for DB initialization...");
      const result = await Promise.race([
        db.initialized,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DB init timeout")), 25000)
        )
      ]);
      dbInitialized = result !== false;
      console.log(`[API] DB initialized: ${dbInitialized}`);
    } catch (err) {
      console.error("[API] DB initialization error:", err.message || err);
      // Continue anyway - allow requests even if DB init fails
      dbInitialized = true;
    }
  }
  next();
});

// For development: wait for DB and start server
if (require.main === module) {
  db.initialized
    .then(() => {
      dbInitialized = true;
      app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });

      try {
        const aiWorker = require('./ai-worker');
        aiWorker.start();
      } catch (e) {
        console.error('Failed to start AI worker:', e && e.message ? e.message : e);
      }
    })
    .catch((err) => {
      console.error('Database initialization failed, exiting:', err && err.message ? err.message : err);
      process.exit(1);
    });
}

// Export for Vercel serverless
module.exports = app;
