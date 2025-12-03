const express = require("express");
const router = express.Router();
const multer = require("multer");
const { GoogleGenAI } = require("@google/genai");

// Configure multer for file uploads - use memory storage for Vercel
const storage = multer.memoryStorage(); // Use memory storage instead of disk storage

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

// Initialize Google AI with the new SDK
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});
 
// Validate API key on startup
if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "[CHATBOT] Warning: Using default API key. Please set GEMINI_API_KEY environment variable for production use."
  );
}

// System prompt for forensic handwriting analysis
const SYSTEM_PROMPT = `You are a forensic handwriting analysis expert assistant for the CrimeWise examination system. You ONLY respond to questions related to:
- Forensic science and forensic handwriting analysis
- The CrimeWise system functionality and features
- Examination procedures and methodologies
- Document examination techniques
- Handwriting comparison and analysis methods

For ANY questions outside these topics, you must respond with: "I can only assist with forensic handwriting analysis and CrimeWise system-related questions. Please ask about forensic examination procedures, handwriting analysis, or system functionality."

When analyzing handwriting images, you must evaluate these specific aspects in order:

1. **General Formation**: Overall structure, style, letter shapes, writing patterns, and general characteristics of the handwriting
2. **Relation to Baseline**: How the writing aligns with the baseline, any deviations, slant patterns, and baseline consistency
3. **Line Quality**: Stroke consistency, pressure variations, tremor presence, line smoothness, and pen control
4. **Proportion and Spacing**: Letter heights, width relationships, spacing between letters/words/lines, and size consistency
5. **Variation**: Consistency patterns, natural variations, unusual characteristics, and any irregularities

If you cannot determine any of these aspects clearly, you must specify why (e.g., "Image quality too poor", "Insufficient sample size", "Lighting conditions inadequate", "Handwriting sample too small", "Image resolution insufficient").

Always provide detailed, professional analysis suitable for forensic examination purposes. Be specific about observable features and limitations.`;

// Chat history storage (in production, this should be in a database)
const chatHistory = new Map();

// POST - Send message to chatbot
router.post("/message", async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Get user's chat history
    const userHistory = chatHistory.get(userId) || [];

    // Build conversation history for context, starting with system prompt
    const conversationHistory = [
      {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }],
      },
      {
        role: "model",
        parts: [
          {
            text: "I understand. I will only respond to questions related to forensic handwriting analysis and the CrimeWise system. How can I assist you with forensic examination procedures or handwriting analysis?",
          },
        ],
      },
    ];

    // Add user's chat history
    userHistory.forEach((msg) => {
      conversationHistory.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    });

    // Add the current user message
    conversationHistory.push({
      role: "user",
      parts: [{ text: message }],
    });

    // Generate content with conversation history using the correct API
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: conversationHistory,
      config: {
        temperature: 0.4, // Balanced temperature for helpful but consistent responses
        topK: 20,
        topP: 0.8,
      },
    });

    const text = response.text;

    if (!text) {
      throw new Error("No response generated from AI service");
    } // Update chat history
    userHistory.push(
      { role: "user", content: message },
      { role: "assistant", content: text }
    );

    // Keep only last 20 messages to prevent context overflow
    if (userHistory.length > 20) {
      userHistory.splice(0, userHistory.length - 20);
    }

    chatHistory.set(userId, userHistory);

    res.json({
      message: text,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CHATBOT][MESSAGE] Error:", error);

    // Check if it's an API key or service error
    if (
      error.message.includes("API key") ||
      error.message.includes("authentication")
    ) {
      res.status(500).json({
        error: "AI service configuration error. Please check API key.",
        details: "Contact administrator to verify Gemini API configuration.",
      });
    } else {
      res.status(500).json({
        error: "Failed to process message",
        details: error.message,
      });
    }
  }
});

// POST - Analyze handwriting image
router.post("/analyze-image", upload.single("image"), async (req, res) => {
  try {
    console.log("[CHATBOT][ANALYZE-IMAGE] Request received");
    console.log(
      "File info:",
      req.file
        ? {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
          }
        : "No file"
    );

    if (!req.file) {
      return res.status(400).json({ error: "Image file is required" });
    }


    // Use the buffer directly from memory storage
    const imageBase64 = req.file.buffer.toString("base64");
    console.log(
      "[CHATBOT][ANALYZE-IMAGE] Image converted to base64, length:",
      imageBase64.length
    );

    // Determine current examination date string (human-readable)
    const examDateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });


    // Get user question if provided
    const userQuestion = req.body.message && req.body.message.trim() ? req.body.message.trim() : null;

    // Fixed forensic analysis prompt
    let analysisPrompt = `${SYSTEM_PROMPT}\n\nAnalyze this handwriting image for forensic examination purposes. You must evaluate ALL of the following aspects in this specific order:\n\n**1. GENERAL FORMATION**\n- Overall structure and architectural style of the handwriting\n- Letter shapes, formation patterns, and writing habits\n- General characteristics and distinctive features\n- Writing style classification (cursive, print, mixed)\n\n**2. RELATION TO BASELINE**\n- Baseline alignment and consistency\n- Slant angle and directional patterns\n- Deviations from baseline (above/below line writing)\n- Baseline stability throughout the sample\n\n**3. LINE QUALITY**\n- Stroke consistency and smoothness\n- Pressure variations and pen control\n- Presence of tremor or hesitation marks\n- Line continuity and flow characteristics\n\n**4. PROPORTION AND SPACING**\n- Letter height relationships (capitals vs. lowercase)\n- Width-to-height ratios of individual letters\n- Inter-letter spacing consistency\n- Inter-word and inter-line spacing patterns\n\n**5. VARIATION**\n- Consistency of letter formations\n- Natural variations vs. unusual irregularities\n- Repeated patterns and habits\n- Unique characteristics or identifying features\n\n**IMPORTANT**: For each aspect, if you cannot make a clear determination, you MUST specify exactly why:\n- \"Image quality insufficient for analysis\"\n- \"Sample size too small for reliable assessment\"\n- \"Lighting conditions prevent clear observation\"\n- \"Resolution too low to examine fine details\"\n- \"Handwriting sample lacks sufficient text\"\n- \"Image blur/distortion affects visibility\"\n- Other specific technical limitations\n\nProvide a structured, professional forensic analysis report. Be precise about what is observable and what limitations prevent complete analysis.`;

    // If a user question is provided, append it to the prompt and instruct the AI to address it
    if (userQuestion) {
      analysisPrompt += `\n\nThe user has a specific question about this handwriting image:\n\n\"${userQuestion}\"\n\nPlease address this question directly in your analysis, in addition to the standard forensic evaluation.`;
    }

    // Append an explicit instruction to include the current examination date
    analysisPrompt += `\n\nPlease include the exact Examination Date: ${examDateStr} in the report header, and do not invent or guess any other dates.`;

    // Generate content with image using the correct API
    console.log("[CHATBOT][ANALYZE-IMAGE] Sending to AI for analysis");
    const response = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        analysisPrompt,
        {
          inlineData: {
            mimeType: req.file.mimetype,
            data: imageBase64,
          },
        },
      ],
    });

    const text = response.text;
    console.log(
      "[CHATBOT][ANALYZE-IMAGE] AI response received, length:",
      text ? text.length : 0
    );

    if (!text) {
      throw new Error("No analysis generated from the image");
    }

    // No need to clean up files since we're using memory storage
    res.json({
      analysis: text,
      examinationDate: examDateStr,
      timestamp: new Date().toISOString(),
      filename: req.file.originalname,
    });
  } catch (error) {
    console.error("[CHATBOT][ANALYZE-IMAGE] Error:", error);

    // No file cleanup needed with memory storage
    // Check if it's an API key or service error
    if (
      error.message.includes("API key") ||
      error.message.includes("authentication")
    ) {
      res.status(500).json({
        error: "AI service configuration error. Please check API key.",
        details: "Contact administrator to verify Gemini API configuration.",
      });
    } else {
      res.status(500).json({
        error: "Failed to analyze image",
        details: error.message,
      });
    }
  }
});

// GET - Test endpoint to verify chatbot is working
router.get("/test", (req, res) => {
  res.json({
    message: "CrimeWise AI Chatbot is running",
    timestamp: new Date().toISOString(),
    status: "active",
  });
});

// GET - List available models
router.get("/models", async (req, res) => {
  try {
    const models = await genAI.models.list();
    res.json({
      models: models,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CHATBOT][MODELS] Error:", error);
    res.status(500).json({ 
      error: "Failed to list models",
      details: error.message 
    });
  }
});

// GET - Get chat history for user
router.get("/history/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    const userHistory = chatHistory.get(userId) || [];

    res.json({
      history: userHistory,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CHATBOT][HISTORY] Error:", error);
    res.status(500).json({ error: "Failed to retrieve chat history" });
  }
});

// DELETE - Clear chat history for user
router.delete("/history/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    chatHistory.delete(userId);

    res.json({
      message: "Chat history cleared successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CHATBOT][CLEAR-HISTORY] Error:", error);
    res.status(500).json({ error: "Failed to clear chat history" });
  }
});

module.exports = router;
