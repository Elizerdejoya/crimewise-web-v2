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
    this.requestCounts = new Map(); // Track requests per key
    this.resetIntervalMs = 60000; // Reset counters every 60 seconds (1 minute)
    this.maxRequestsPerMinutePerKey = 10; // Conservative: 10 RPM per key
    this.requestTimestamps = new Map(); // Track last request time per key
    
    console.log(`[API-KEY-MANAGER] Loaded ${this.apiKeys.length} API key(s) for AI grading`);
    console.log(`[API-KEY-MANAGER] Max capacity: ${this.apiKeys.length * this.maxRequestsPerMinutePerKey} RPM`);
    if (this.apiKeys.length === 0) {
      console.warn('[API-KEY-MANAGER] WARNING: No API keys configured!');
    }
    
    // Initialize request counts
    this.apiKeys.forEach((_, index) => {
      this.requestCounts.set(index, 0);
      this.requestTimestamps.set(index, Date.now());
    });
    
    // Reset counters every 60 seconds
    setInterval(() => this.resetCounters(), this.resetIntervalMs);
  }

  loadApiKeys() {
    const keys = [];

    // Check for numbered grader keys: GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc. (1-6 for grader)
    for (let i = 1; i <= 6; i++) {
      const envKey = `GEMINI_API_KEY_${i}`;
      if (process.env[envKey]) {
        keys.push(process.env[envKey]);
      }
    }

    // Check for comma-separated GRADER_API_KEYS env var (e.g., "key1,key2,key3")
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
      const lastRequestTime = this.requestTimestamps.get(i) || Date.now();
      const timeSinceLastRequest = now - lastRequestTime;
      
      // Only reset if at least 60 seconds have passed
      if (timeSinceLastRequest >= this.resetIntervalMs) {
        this.requestCounts.set(i, 0);
        this.requestTimestamps.set(i, now);
      }
    }
  }

  /**
   * Get the next API key in intelligent round-robin rotation
   * Avoids keys that are approaching rate limits
   * @returns {string} API key
   */
  getNextApiKey() {
    if (this.apiKeys.length === 0) {
      throw new Error('No API keys configured for AI grader');
    }

    // Update counters based on time
    this.resetCounters();

    // Find key with lowest request count (load balancing)
    let bestIndex = 0;
    let minCount = this.requestCounts.get(0) || 0;

    for (let i = 1; i < this.apiKeys.length; i++) {
      const count = this.requestCounts.get(i) || 0;
      // Prefer key if it has fewer requests OR if its counter was recently reset
      if (count < minCount) {
        bestIndex = i;
        minCount = count;
      }
    }

    // Increment counter for selected key
    const currentCount = (this.requestCounts.get(bestIndex) || 0) + 1;
    this.requestCounts.set(bestIndex, currentCount);
    this.requestTimestamps.set(bestIndex, Date.now());

    const utilizationPercent = Math.round((currentCount / this.maxRequestsPerMinutePerKey) * 100);
    console.log(`[API-KEY-MANAGER] Using key ${bestIndex + 1}/${this.apiKeys.length} (${currentCount}/${this.maxRequestsPerMinutePerKey} RPM, ${utilizationPercent}% utilization)`);

    return this.apiKeys[bestIndex];
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
