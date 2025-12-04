/**
 * API Key Manager for distributing AI grading requests across multiple Gemini API keys
 * Implements intelligent round-robin rotation with rate limit awareness
 * 
 * Purpose: Distribute AI grading load across 6 dedicated API keys to:
 * - Maximize throughput (6 keys × 10 RPM = 60 RPM; 6 keys × 250 RPD = 1,500 RPD)
 * - Prevent hitting individual key rate limits
 * - Ensure faster, more reliable grading for high-volume submissions
 * 
 * Key allocation:
 * - GEMINI_API_KEY_1 through GEMINI_API_KEY_6: AI grader keys (primary)
 * - GEMINI_API_KEY: Chatbot key (separate, not rotated by this manager)
 * 
 * Usage:
 * - Set environment variables: GEMINI_API_KEY_1 through GEMINI_API_KEY_6
 * - Or set GRADER_API_KEYS as comma-separated list
 * - Call getNextApiKey() to get the next key in rotation
 * - This manager ONLY handles grader keys, not chatbot key
 */

class ApiKeyManager {
  constructor() {
    this.apiKeys = this.loadApiKeys();
    this.currentIndex = 0;
    this.requestCounts = new Map(); // Track requests per key (current minute)
    this.resetIntervalMs = 60000; // Reset counters every 60 seconds (1 minute)
    this.maxRequestsPerMinutePerKey = 8; // Use 8 RPM per key as requested (safe margin)
    this.lastRequestAt = new Map(); // last request timestamp per key
    this.penaltyUntil = new Map(); // if a key is penalized (429), timestamp until which it's excluded
    this.backoffSeconds = new Map(); // current backoff multiplier per key

    console.log(`[API-KEY-MANAGER] Loaded ${this.apiKeys.length} API key(s) for AI grading`);
    console.log(`[API-KEY-MANAGER] Max capacity: ${this.apiKeys.length * this.maxRequestsPerMinutePerKey} RPM`);
    if (this.apiKeys.length === 0) {
      console.warn('[API-KEY-MANAGER] WARNING: No API keys configured!');
    }
    
    // Initialize request counts
    this.apiKeys.forEach((_, index) => {
      this.requestCounts.set(index, 0);
      this.lastRequestAt.set(index, 0);
      this.penaltyUntil.set(index, 0);
      this.backoffSeconds.set(index, 0);
    });
    
    // Reset counters every 60 seconds
    setInterval(() => this.resetCounters(), this.resetIntervalMs);
  }

  loadApiKeys() {
    const keys = [];

    // Check for numbered grader keys: GEMINI_API_KEY_1 .. GEMINI_API_KEY_6 (grader)
    for (let i = 1; i <= 6; i++) {
      const envKey = `GEMINI_API_KEY_${i}`;
      if (process.env[envKey]) {
        keys.push(process.env[envKey]);
      }
    }

    // Fallback: comma-separated GRADER_API_KEYS env var (e.g., "key1,key2,...")
    if (keys.length === 0 && process.env.GRADER_API_KEYS) {
      const commaSeparated = process.env.GRADER_API_KEYS.split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      keys.push(...commaSeparated);
    }

    return keys;
  }

  resetCounters() {
    const now = Date.now();
    for (let i = 0; i < this.apiKeys.length; i++) {
      const last = this.lastRequestAt.get(i) || 0;
      const timeSinceLastRequest = now - last;

      // Reset minute counters if last request was more than reset interval ago
      if (timeSinceLastRequest >= this.resetIntervalMs) {
        this.requestCounts.set(i, 0);
      }
    }
  }

  /**
   * Get the next API key in intelligent round-robin rotation
   * Avoids keys that are approaching rate limits
   * @returns {string} API key
   */
  /**
   * Get the next API key object: { key, index, waitMs }
   * waitMs indicates how long the caller should wait before using the key (ms).
   */
  getNextKey() {
    if (this.apiKeys.length === 0) {
      throw new Error('No API keys configured for AI grader');
    }

    this.resetCounters();

    const now = Date.now();
    let bestIndex = -1;
    let bestScore = Infinity;
    let bestWait = 0;

    for (let i = 0; i < this.apiKeys.length; i++) {
      const penalUntil = this.penaltyUntil.get(i) || 0;
      if (penalUntil > now) {
        // temporarily skip penalized keys
        continue;
      }

      const count = this.requestCounts.get(i) || 0;
      const lastAt = this.lastRequestAt.get(i) || 0;
      const timeSince = now - lastAt;
      const minInterval = Math.ceil(60000 / this.maxRequestsPerMinutePerKey); // ms between allowed requests
      const waitMs = Math.max(0, minInterval - timeSince);

      // scoring: prefer lower count but also lower wait
      const score = count * 1000 + waitMs;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = i;
        bestWait = waitMs;
      }
    }

    if (bestIndex === -1) {
      // All keys penalized; pick the one with earliest penalty expiry
      let earliest = Infinity;
      let pick = 0;
      for (let i = 0; i < this.apiKeys.length; i++) {
        const penalUntil = this.penaltyUntil.get(i) || 0;
        if (penalUntil < earliest) {
          earliest = penalUntil;
          pick = i;
        }
      }
      const waitMs = Math.max(0, earliest - now);
      return { key: this.apiKeys[pick], index: pick, waitMs };
    }

    return { key: this.apiKeys[bestIndex], index: bestIndex, waitMs: bestWait };
  }

  /**
   * Mark that a request was made with the given key index (success path)
   */
  markRequest(index) {
    if (index == null) return;
    const now = Date.now();
    this.lastRequestAt.set(index, now);
    const prev = this.requestCounts.get(index) || 0;
    this.requestCounts.set(index, prev + 1);
    // reset any backoff on success
    this.backoffSeconds.set(index, 0);
  }

  /**
   * Report a failure for a key (e.g., 429 or 5xx). If 429, apply penalty/backoff.
   * retryAfterSeconds: optional number from server (Retry-After header)
   */
  reportFailure(index, statusCode = 0, retryAfterSeconds = null) {
    if (index == null) return;
    const now = Date.now();
    if (statusCode === 429) {
      // exponential backoff per key
      const prevBackoff = this.backoffSeconds.get(index) || 0;
      const nextBackoff = prevBackoff ? Math.min(prevBackoff * 2, 300) : 10; // start 10s, double up to 5min
      const penalty = retryAfterSeconds ? Math.max(nextBackoff, retryAfterSeconds) : nextBackoff;
      this.backoffSeconds.set(index, penalty);
      this.penaltyUntil.set(index, now + penalty * 1000);
      console.warn(`[API-KEY-MANAGER] Key ${index + 1} penalized for ${penalty}s due to 429`);
    } else if (statusCode >= 500) {
      // server errors: small penalty
      const small = 5;
      this.penaltyUntil.set(index, now + small * 1000);
      console.warn(`[API-KEY-MANAGER] Key ${index + 1} temporarily penalized for ${small}s due to ${statusCode}`);
    } else {
      // generic failure: short penalty
      const short = 3;
      this.penaltyUntil.set(index, now + short * 1000);
    }
  }

  /**
   * Reset rotation to start from first key (manual reset if needed)
   */
  resetRotation() {
    this.currentIndex = 0;
    this.resetCounters();
  }

  /**
   * Get total number of API keys
   */
  getKeyCount() {
    return this.apiKeys.length;
  }

  /**
   * Get current index (for debugging)
   */
  getCurrentIndex() {
    return this.currentIndex;
  }

  /**
   * Get utilization stats for monitoring
   */
  getStats() {
    const stats = {
      totalKeys: this.apiKeys.length,
      keyUtilization: [],
      totalCapacityRPM: this.apiKeys.length * this.maxRequestsPerMinutePerKey,
      maxRPD: this.apiKeys.length * 250,
    };

    for (let i = 0; i < this.apiKeys.length; i++) {
      const count = this.requestCounts.get(i) || 0;
      const utilizationPercent = Math.round((count / this.maxRequestsPerMinutePerKey) * 100);
      stats.keyUtilization.push({
        keyNumber: i + 1,
        requestsThisMinute: count,
        maxPerMinute: this.maxRequestsPerMinutePerKey,
        utilizationPercent: utilizationPercent,
      });
    }

    return stats;
  }
}

// Export singleton instance
module.exports = new ApiKeyManager();
