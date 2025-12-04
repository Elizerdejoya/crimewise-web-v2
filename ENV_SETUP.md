# Environment Variables Setup Guide

## Overview

CrimeWise system has two separate deployments on Vercel:
- **Backend:** `https://crimewise-web-v2-ri4n.vercel.app` (Express API)
- **Frontend:** `https://crimewise-web-v2.vercel.app` (React/Vite)

Each has different environment variable requirements.

---

## Backend Environment Variables (Vercel)

### **Required Variables**

#### Database
```
DB_URL=sqlitecloud://cxd2tnbwvk.g5.sqlite.cloud:8860/crimewise?apikey=euIjfRGcZnywBxr10nuXqdrk6BXamqJZvXRalZPVWVg
```
SQLite Cloud connection string with API key for database access.

#### Authentication
```
JWT_SECRET=<your_strong_random_string_here>
```
Generate a strong random string (min 32 characters) for JWT token signing.
```bash
# Generate on Mac/Linux:
openssl rand -base64 32

# Generate on Windows PowerShell:
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

#### Gemini API Keys
```
GEMINI_API_KEY=<chatbot_key>
GEMINI_API_KEY_1=<grader_key_1>
GEMINI_API_KEY_2=<grader_key_2>
GEMINI_API_KEY_3=<grader_key_3>
GEMINI_API_KEY_4=<grader_key_4>
GEMINI_API_KEY_5=<grader_key_5>
GEMINI_API_KEY_6=<grader_key_6>
```

**Explanation:**
- `GEMINI_API_KEY`: Single key dedicated to chatbot (not rotated)
- `GEMINI_API_KEY_1` through `GEMINI_API_KEY_6`: AI grader keys with round-robin rotation
  - **Rate limits per key:** 10 RPM, 250 RPD
  - **Total capacity:** 6 keys × 8 RPM = 48 RPM (safely below 60 RPM limit)
  - **Load balancing:** Intelligent rotation to prevent hitting individual key limits

### **Optional Variables**

```
AI_WORKER_CONCURRENCY=6              # Concurrent grading jobs (1-6, default: 6)
AI_WORKER_POLL_MS=2000               # Queue check interval in ms (default: 2000)
AI_WORKER_MAX_RETRIES=3              # Failed job retry attempts (default: 3)
NODE_ENV=production                  # Set to production in Vercel
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM=noreply@crimewise.com
```

### **Steps to Set in Vercel**

1. Go to https://vercel.com/dashboard
2. Select project `crimewise-web-v2-ri4n`
3. Navigate to **Settings** → **Environment Variables**
4. Add each variable with its value
5. Ensure variables are set for **Production** environment
6. **Redeploy** project to apply changes

---

## Frontend Environment Variables (Vercel)

### **Required Variables**

```
VITE_API_URL=/api
```

The frontend uses relative path `/api` which automatically routes to the backend.

### **Why No Secrets Needed**

- Frontend builds once and is distributed globally
- All API calls go through `/api` proxy (configured in Vercel)
- No sensitive credentials stored in frontend code
- API key rotation happens server-side only

### **Steps to Set in Vercel**

1. Go to https://vercel.com/dashboard
2. Select project `crimewise-web-v2`
3. Navigate to **Settings** → **Environment Variables**
4. Verify `VITE_API_URL=/api` is set
5. No redeploy needed if already set

---

## Local Development Setup

### **Backend (.env file)**

1. Copy `.env.example` to `.env`
   ```bash
   cp backend/.env.example backend/.env
   ```

2. Fill in your values:
   ```
   DB_URL=...
   JWT_SECRET=...
   GEMINI_API_KEY=...
   GEMINI_API_KEY_1=...
   # etc.
   ```

3. Run backend:
   ```bash
   cd backend
   npm install
   npm start
   ```

### **Frontend**

1. Frontend uses `.env.production` for production builds
2. For local development, uses default API URL (localhost:5000 or configured URL)
3. Environment variables are build-time only (baked into JS bundle)

---

## Important Security Notes

### **Never Commit Secrets**

```bash
# Ensure .env files are in .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
git rm --cached .env  # Remove from git if already committed
git commit -m "Remove .env from git tracking"
```

### **Vercel Environment Variables**

- Automatically encrypted at rest
- Not visible in browser (server-side only)
- Each deployment can have different values (Production, Preview, Development)
- Can be rotated without code changes

### **API Key Rotation**

**When to rotate:**
- Suspected compromise
- Regular security hygiene (quarterly)
- Key leak detected

**How to rotate:**
1. Generate new keys in Google Cloud console
2. Update in Vercel dashboard
3. Keep old keys as fallback for 24 hours
4. Remove old keys after verification

---

## Monitoring and Debugging

### **API Endpoints to Check Configuration**

```bash
# Check API key utilization
curl https://crimewise-web-v2-ri4n.vercel.app/api/monitor/api-keys

# Check AI worker queue status
curl https://crimewise-web-v2-ri4n.vercel.app/api/monitor/ai-worker

# Health check
curl https://crimewise-web-v2-ri4n.vercel.app/health

# Test connectivity
curl https://crimewise-web-v2-ri4n.vercel.app/test
```

### **Vercel Logs**

View backend logs in Vercel dashboard:
1. Go to project
2. Click **Deployments**
3. Find recent deployment
4. Click **Runtime Logs**
5. Search for `[GRADER]`, `[AI-WORKER]`, `[API-KEY-MANAGER]`

---

## Performance Targets

With 6 API keys at 8 RPM each:

- **300 students submitting simultaneously:** 5-10 minutes for all grades
- **Throughput:** ~48 grading requests per minute
- **Daily capacity:** ~69,000 submissions per day
- **Rate limit safety:** 8/10 RPM = 80% utilization (safe margin)

---

## Troubleshooting

### **"No API keys configured" error**

Check that `GEMINI_API_KEY_1` through `GEMINI_API_KEY_6` are set:
```bash
# In Vercel dashboard, verify all keys are visible
# Keys should not show full value for security, but should show as "encrypted"
```

### **Rate limit errors (429)**

- Indicates requests exceeding 10 RPM per key
- System should auto-rotate to next key
- Check `GET /api/monitor/api-keys` for utilization
- If all keys at >80%, reduce `AI_WORKER_CONCURRENCY`

### **Queue backing up (thousands pending)**

- `GET /api/monitor/ai-worker` shows queue depth
- May indicate slow Gemini API response times
- Check Vercel logs for `[AI-WORKER]` messages
- Verify `GEMINI_API_KEY_*` are valid and not rate-limited

### **Database connection timeout**

- Verify `DB_URL` is correct
- Check SQLite Cloud dashboard for connection status
- Ensure GitHub Actions keep-alive workflow is running
- May need to manually ping `/api/cron/keep-alive`

---

## Quick Reference

| Component | Backend Env | Frontend Env | Notes |
|-----------|------------|------------|-------|
| Database | ✓ DB_URL | - | Server-side only |
| JWT | ✓ JWT_SECRET | - | Never expose |
| Chatbot API Key | ✓ GEMINI_API_KEY | - | Single key |
| Grader API Keys | ✓ GEMINI_API_KEY_1-6 | - | 6 keys rotated |
| API URL | - | VITE_API_URL=/api | Relative path |
| Worker Config | ✓ (optional) | - | Concurrency, polls |
| Email | ✓ (optional) | - | SMTP settings |

---

Generated: 2025-12-04  
For questions or issues, check Vercel logs or backend monitoring endpoints.
