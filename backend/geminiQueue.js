// ⚠️ DEPRECATED: This file is no longer used
// Queueing is now handled by ai-worker.js with proper concurrency limits and rate limiting
// 
// The old geminiQueue was a bottleneck:
// - Processed only 1 request at a time
// - Applied arbitrary 1 second delays
// - Did not utilize multiple API keys
//
// New approach (ai-worker.js):
// - Processes up to 6 jobs concurrently (one per API key)
// - Implements intelligent rate limiting (8 RPM per key = 48 total RPM)
// - Uses apiKeyManager for load balancing
// - Much faster for high-volume submissions

console.warn('[GEMINI-QUEUE] ⚠️ This module is DEPRECATED. Use ai-worker.js instead.');

class GeminiQueue {
  constructor() {
    console.warn('[GEMINI-QUEUE] GeminiQueue is deprecated. All grading jobs are now processed by ai-worker.js');
  }

  add(task) {
    console.warn('[GEMINI-QUEUE] add() is deprecated. Submitting to /api/ai-grader/submit instead.');
  }
}

module.exports = new GeminiQueue();
