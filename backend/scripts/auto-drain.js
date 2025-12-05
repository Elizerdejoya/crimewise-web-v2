// Simple auto-drain script: repeatedly call /api/trigger-ai-worker until pending==0
// Usage: node auto-drain.js <baseUrl> [intervalMs]
// Example: node auto-drain.js https://crimewise-web-v2-ri4n.vercel.app 1500

const base = process.argv[2] || 'http://localhost:5000';
const intervalMs = Number(process.argv[3] || 1500);
const fetch = global.fetch || require('node-fetch');

if (!base) {
  console.error('Usage: node auto-drain.js <baseUrl> [intervalMs]');
  process.exit(2);
}

async function getPending() {
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/api/monitor/ai-worker`);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.aiWorkerQueue ? Number(j.aiWorkerQueue.pending || 0) : null;
  } catch (e) {
    console.error('Failed to fetch monitor:', e && e.message ? e.message : e);
    return null;
  }
}

async function trigger(limit = 6, rounds = 2) {
  try {
    const r = await fetch(`${base.replace(/\/$/, '')}/api/trigger-ai-worker?limit=${limit}&rounds=${rounds}` , { method: 'POST' });
    if (!r.ok) {
      console.error('Trigger failed:', r.status, await r.text());
      return null;
    }
    const j = await r.json();
    return j;
  } catch (e) {
    console.error('Trigger error:', e && e.message ? e.message : e);
    return null;
  }
}

(async () => {
  console.log('Auto-drain starting against', base);
  for (;;) {
    const pending = await getPending();
    if (pending === null) {
      console.log('Could not read pending count; will attempt trigger once and retry');
      await trigger();
      await new Promise(r => setTimeout(r, intervalMs));
      continue;
    }
    console.log('Pending:', pending);
    if (pending === 0) break;

    const resp = await trigger(6, 3);
    console.log('Trigger response:', resp && resp.processed != null ? `${resp.processed} processed` : JSON.stringify(resp));

    // Wait briefly for serverless to finish processing
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.log('Queue drained (pending == 0)');
})();
