// Simple FIFO queue for Gemini calls with 1 second delay between requests
type Task = () => Promise<any>;

class GeminiQueue {
  private queue: Task[] = [];
  private running = false;

  add(task: Task) {
    this.queue.push(task);
    this.runNext();
  }

  private async runNext() {
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
    // continue with remaining tasks
    if (this.queue.length > 0) this.runNext();
  }
}

const singleton = new GeminiQueue();
export default singleton;
