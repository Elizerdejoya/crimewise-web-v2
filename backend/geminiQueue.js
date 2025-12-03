// Simple FIFO queue for Gemini calls with 1 second delay between requests
class GeminiQueue {
  constructor() {
    this.queue = [];
    this.running = false;
  }

  add(task) {
    this.queue.push(task);
    this.runNext();
  }

  async runNext() {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;
    this.running = true;
    try {
      await next();
    } catch (err) {
      console.error('[GEMINI-QUEUE] Task error:', err);
    }
    // wait 1 second before running the following task to respect rate limits
    await new Promise((r) => setTimeout(r, 1000));
    this.running = false;
    if (this.queue.length > 0) this.runNext();
  }
}

module.exports = new GeminiQueue();
