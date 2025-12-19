const express = require("express");
const router = express.Router();
const db = require("../db");
const { SignJWT } = require("jose");
const { authenticateToken, addOrganizationFilter } = require("../middleware");
const nodemailer = require("nodemailer");
const SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Polyfill TextEncoder for Node.js compatibility (Vercel serverless)
const { TextEncoder } = require("util");

// Home/test endpoint: show tables, endpoints, and test forms
// router.get('/', async (req, res) => {
//   try {
//     const tables = await db.sql`SELECT name FROM sqlite_master WHERE type='table'`;
//     const endpoints = [
//       { method: 'GET', path: '/api/batches' },
//       { method: 'POST', path: '/api/batches' },
//       { method: 'PUT', path: '/api/batches/:id' },
//       { method: 'DELETE', path: '/api/batches/:id' },
//       { method: 'GET', path: '/api/courses' },
//       { method: 'POST', path: '/api/courses' },
//       { method: 'PUT', path: '/api/courses/:id' },
//       { method: 'DELETE', path: '/api/courses/:id' },
//       { method: 'GET', path: '/api/classes' },
//       { method: 'POST', path: '/api/classes' },
//       { method: 'PUT', path: '/api/classes/:id' },
//       { method: 'DELETE', path: '/api/classes/:id' },
//       { method: 'GET', path: '/api/instructors' },
//       { method: 'POST', path: '/api/instructors' },
//       { method: 'PUT', path: '/api/instructors/:id' },
//       { method: 'DELETE', path: '/api/instructors/:id' },
//       { method: 'GET', path: '/api/students/full' },
//       { method: 'POST', path: '/api/students' },
//       { method: 'PUT', path: '/api/students/:id' },
//       { method: 'DELETE', path: '/api/students/:id' },
//       { method: 'GET', path: '/api/users' },
//       { method: 'PUT', path: '/api/users/:id/status' },
//       { method: 'DELETE', path: '/api/users/:id' },
//     ];
//     res.send(`
//       <html>
//         <head>
//           <title>CrimeWiseSys API Test</title>
//           <style>
//             body { font-family: sans-serif; margin: 2rem; }
//             h2 { margin-top: 2rem; }
//             table { border-collapse: collapse; margin-bottom: 2rem; }
//             th, td { border: 1px solid #ccc; padding: 0.5rem 1rem; }
//             form { margin-bottom: 1.5rem; }
//             input, select { margin: 0.2rem 0.5rem 0.2rem 0; }
//             .success { color: green; }
//             .error { color: red; }
//           </style>
//         </head>
//         <body>
//           <h1>CrimeWiseSys API Test &amp; Info</h1>
//           <h2>SQLite Tables</h2>
//           <ul>
//             ${(tables||[]).map(t => `<li>${t.name}</li>`).join('')}
//           </ul>
//           <h2>API Endpoints</h2>
//           <table><tr><th>Method</th><th>Path</th></tr>
//             ${endpoints.map(e => `<tr><td>${e.method}</td><td>${e.path}</td></tr>`).join('')}
//           </table>
//           <h2>Test: GET /api/batches</h2>
//           <form onsubmit="event.preventDefault(); fetch('/api/batches').then(r=>r.json()).then(d=>{document.getElementById('batches-result').textContent=JSON.stringify(d,null,2)}).catch(e=>{document.getElementById('batches-result').textContent=e})">
//             <button type="submit">Fetch Batches</button>
//           </form>
//           <pre id="batches-result" style="background:#f6f6f6;padding:1em;"></pre>
//           <h2>Test: POST /api/batches</h2>
//           <form id="add-batch-form" onsubmit="event.preventDefault(); var f=this; fetch('/api/batches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:f.name.value,startDate:f.startDate.value,endDate:f.endDate.value,status:f.status.value})}).then(r=>r.json()).then(d=>{document.getElementById('add-batch-result').textContent=JSON.stringify(d,null,2)}).catch(e=>{document.getElementById('add-batch-result').textContent=e})">
//             <input name="name" placeholder="Batch Name" required />
//             <input name="startDate" placeholder="Start Date" required />
//             <input name="endDate" placeholder="End Date" required />
//             <select name="status"><option>Active</option><option>Inactive</option></select>
//             <button type="submit">Add Batch</button>
//           </form>
//           <pre id="add-batch-result" style="background:#f6f6f6;padding:1em;"></pre>
//         </body>
//       </html>
//     `);
//   } catch (err) {
//     console.log('[HOME][GET] Error:', err.message);
//     res.status(500).send(`Error: ${err.message}`);
//   }
// });

// Admin overview counts
router.get(
  "/api/admin/overview-counts",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let queries;
      if (orgFilter.hasFilter) {
        // Organization-specific counts for non-super_admin users
        queries = [
          db.sql`SELECT COUNT(*) as count FROM batches WHERE organization_id = ${orgFilter.organizationId}`,
          db.sql`SELECT COUNT(*) as count FROM classes WHERE organization_id = ${orgFilter.organizationId}`,
          db.sql`SELECT COUNT(*) as count FROM users WHERE role = 'instructor' AND organization_id = ${orgFilter.organizationId}`,
          db.sql`SELECT COUNT(*) as count FROM users WHERE role = 'student' AND organization_id = ${orgFilter.organizationId}`,
          db.sql`SELECT COUNT(*) as count FROM courses WHERE organization_id = ${orgFilter.organizationId}`,
          db.sql`SELECT COUNT(*) as count FROM questions WHERE organization_id = ${orgFilter.organizationId}`,
          db.sql`SELECT COUNT(*) as count FROM results r JOIN users u ON r.student_id = u.id WHERE u.organization_id = ${orgFilter.organizationId}`,
          db.sql`SELECT COUNT(*) as count FROM users WHERE organization_id = ${orgFilter.organizationId}`,
        ];
      } else {
        // Global counts for super_admin
        queries = [
          db.sql`SELECT COUNT(*) as count FROM batches`,
          db.sql`SELECT COUNT(*) as count FROM classes`,
          db.sql`SELECT COUNT(*) as count FROM users WHERE role = 'instructor'`,
          db.sql`SELECT COUNT(*) as count FROM users WHERE role = 'student'`,
          db.sql`SELECT COUNT(*) as count FROM courses`,
          db.sql`SELECT COUNT(*) as count FROM questions`,
          db.sql`SELECT COUNT(*) as count FROM results`,
          db.sql`SELECT COUNT(*) as count FROM users`,
        ];
      }

      // Execute all queries in parallel using Promise.all
      const [
        batches,
        classes,
        instructors,
        students,
        courses,
        questions,
        results,
        users,
      ] = await Promise.all(queries);

      // Format the response
      const counts = {
        batches: batches[0]?.count || 0,
        classes: classes[0]?.count || 0,
        instructors: instructors[0]?.count || 0,
        students: students[0]?.count || 0,
        courses: courses[0]?.count || 0,
        questions: questions[0]?.count || 0,
        results: results[0]?.count || 0,
        users: users[0]?.count || 0,
      };

      res.json(counts);
    } catch (err) {
      console.log("[HOME][COUNTS] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// Admin recent exams endpoint
router.get(
  "/api/admin/recent-exams",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();
      const { limit = 10 } = req.query;

      let query;
      if (orgFilter.hasFilter) {
        // Organization-specific recent exams
        query = await db.sql`
        SELECT 
          e.*,
          COUNT(r.id) as participants,
          CASE 
            WHEN COUNT(r.id) > 0 THEN ROUND(AVG(r.score), 2)
            ELSE NULL 
          END as avgScore,
          q.points as totalItemScore,
          q.type as question_type,
          q.answer as answer_key,
          q.title as question_title,
          q.text as question_text,
          u.name as instructor_name
        FROM exams e
        JOIN users u ON e.instructor_id = u.id
        LEFT JOIN results r ON e.id = r.exam_id
        LEFT JOIN questions q ON e.question_id = q.id
        WHERE u.organization_id = ${orgFilter.organizationId}
          AND e.start <= CURRENT_TIMESTAMP
        GROUP BY e.id, q.id
        ORDER BY e.start DESC
        LIMIT ${parseInt(limit)}
      `;
      } else {
        // Global recent exams for super_admin
        query = await db.sql`
        SELECT 
          e.*,
          COUNT(r.id) as participants,
          CASE 
            WHEN COUNT(r.id) > 0 THEN ROUND(AVG(r.score), 2)
            ELSE NULL 
          END as avgScore,
          q.points as totalItemScore,
          q.type as question_type,
          q.answer as answer_key,
          q.title as question_title,
          q.text as question_text,
          u.name as instructor_name
        FROM exams e
        JOIN users u ON e.instructor_id = u.id
        LEFT JOIN results r ON e.id = r.exam_id
        LEFT JOIN questions q ON e.question_id = q.id
        WHERE e.start <= CURRENT_TIMESTAMP
        GROUP BY e.id, q.id
        ORDER BY e.start DESC
        LIMIT ${parseInt(limit)}
      `;
      }

      res.json(query);
    } catch (err) {
      console.log("[HOME][RECENT-EXAMS] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// Login endpoint
router.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log(`[LOGIN] Attempt: email=${email}`);

    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    // Try to find user by email (ignoring role, we'll auto-detect from DB)
    // First check super_admin
    let user = null;
    try {
      let users = await db.sql`SELECT * FROM users WHERE email = ${email} AND role = 'super_admin'`;
      
      if (users && users.length > 0) {
        user = users[0];
        console.log(`[LOGIN] Found super admin: ${email}`);
      } else {
        // Try other roles (admin, instructor, student)
        users = await db.sql`
          SELECT u.*, o.name as organization_name, o.status as org_status 
          FROM users u 
          LEFT JOIN organizations o ON u.organization_id = o.id 
          WHERE u.email = ${email}
        `;
        
        if (users && users.length > 0) {
          user = users[0];
          console.log(`[LOGIN] Found ${user.role} user: ${email}`);
        }
      }
    } catch (dbErr) {
      console.error(`[LOGIN] DB error while fetching user: ${dbErr.message}`);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (!user) {
      console.log(`[LOGIN] User not found: ${email}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (password !== user.password) {
      console.log(`[LOGIN] Password mismatch: ${email}`);
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Check if organization is active (only for non-super_admin users)
    if (user.role !== 'super_admin' && user.org_status !== "active") {
      console.log(
        `[LOGIN] Organization inactive: ${user.organization_name}, status: ${user.org_status}`
      );
      return res
        .status(403)
        .json({ error: "Organization account is inactive" });
    }

    // Use Buffer.from() for cross-platform compatibility (works in Node.js and Vercel)
    const secret = Buffer.from(SECRET, 'utf8');
    
    // Build JWT payload based on user role
    let jwtPayload = {
      id: typeof user.id === "string" ? parseInt(user.id, 10) : user.id,
      email: user.email,
      role: user.role,
    };

    // Add organization info if user is not super_admin
    if (user.role !== 'super_admin') {
      jwtPayload.organization_id = user.organization_id;
    }

    const token = await new SignJWT(jwtPayload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    console.log(
      `[LOGIN] Login successful: ${email}, role: ${user.role}`
    );
    res.json({
      id: user.id,
      token,
      role: user.role,
      ...(user.organization_id && { organization_id: user.organization_id }),
      ...(user.organization_name && { organization_name: user.organization_name }),
    });
  } catch (err) {
    console.error("[HOME][LOGIN] Error:", err && err.stack ? err.stack : err.message);
    res.status(500).json({ error: "Login failed" });
  }
});

// Forgot password endpoint - generates a reset token and sends email
router.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    console.log(`[FORGOT-PASSWORD] Request for email: ${email}`);

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // Check if user exists
    let user = null;
    try {
      let users = await db.sql`SELECT id, email, role FROM users WHERE email = ${email}`;
      if (users && users.length > 0) {
        user = users[0];
        console.log(`[FORGOT-PASSWORD] User found: ${email}`);
      }
    } catch (dbErr) {
      console.error(`[FORGOT-PASSWORD] DB error: ${dbErr.message}`);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (!user) {
      // For security, don't reveal if user exists or not
      console.log(`[FORGOT-PASSWORD] User not found (security): ${email}`);
      return res.status(200).json({ 
        message: "If an account exists with this email, a reset link has been sent" 
      });
    }

    // Generate a reset token
    const crypto = require('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    // Token expiry is configurable via RESET_TOKEN_EXPIRY_HOURS (hours). Default to 24 hours.
    const expiryHours = parseInt(process.env.RESET_TOKEN_EXPIRY_HOURS || '24', 10) || 24;
    const resetTokenExpiry = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    console.log(`[FORGOT-PASSWORD] Using reset token expiry (hours): ${expiryHours}`);

    try {
      // Store reset token in users table (add reset_token and reset_token_expiry columns if needed)
      await db.sql`UPDATE users SET reset_token = ${resetToken}, reset_token_expiry = ${resetTokenExpiry.toISOString()} WHERE id = ${user.id}`;
      console.log(`[FORGOT-PASSWORD] Reset token stored for ${email}`);

      // Send email with reset link
      const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;
      
      // Configure email transporter
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true' || false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
        // Optional logging/debug to help diagnose SMTP issues during development
        logger: process.env.SMTP_DEBUG === 'true' || false,
        debug: process.env.SMTP_DEBUG === 'true' || false,
      });

      // Email content
      const mailOptions = {
        from: process.env.EMAIL_USER || 'noreply@crimewise.com',
        to: email,
        subject: 'CrimeWise - Password Reset Request',
        html: `
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your CrimeWise account.</p>
          <p>Click the link below to reset your password. This link will expire in 1 hour:</p>
          <p>
            <a href="${resetLink}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
              Reset Password
            </a>
          </p>
          <p>Or copy and paste this link in your browser:</p>
          <p>${resetLink}</p>
          <p>If you didn't request this, you can ignore this email.</p>
          <hr>
          <p style="color: #666; font-size: 12px;">CrimeWise Forensic Examination System</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log(`[FORGOT-PASSWORD] Email sent successfully to ${email}`);

      return res.status(200).json({ 
        message: "Password reset link has been sent to your email" 
      });
    } catch (err) {
      console.error(`[FORGOT-PASSWORD] Error: ${err.message}`);
      return res.status(500).json({ error: "Failed to process password reset. Please try again later." });
    }
  } catch (err) {
    console.error("[FORGOT-PASSWORD] Error:", err && err.stack ? err.stack : err.message);
    res.status(500).json({ error: "Password reset failed" });
  }
});

// Reset password endpoint - validates token and sets new password
router.post("/api/reset-password", async (req, res) => {
  try {
    const { email, token, password } = req.body;
    console.log(`[RESET-PASSWORD] Request for email: ${email}`);

    if (!email || !token || !password) {
      return res.status(400).json({ error: "Email, token and password are required" });
    }

    // Find user with matching token
    let users;
    try {
      users = await db.sql`SELECT id, reset_token, reset_token_expiry FROM users WHERE email = ${email} AND reset_token = ${token}`;
    } catch (dbErr) {
      console.error(`[RESET-PASSWORD] DB error: ${dbErr.message}`);
      return res.status(500).json({ error: "Database query failed" });
    }

    if (!users || users.length === 0) {
      console.log(`[RESET-PASSWORD] Invalid token for email: ${email}`);
      return res.status(400).json({ error: "Invalid token or email" });
    }

    const user = users[0];
    // Detailed logging for debugging token expiry issues
    const rawExpiry = user.reset_token_expiry;
    console.log(`[RESET-PASSWORD] Stored reset_token_expiry (raw): ${rawExpiry}`);
    const expiry = rawExpiry ? new Date(rawExpiry) : null;
    console.log(`[RESET-PASSWORD] Parsed expiry: ${expiry ? expiry.toISOString() : 'null'}`);
    console.log(`[RESET-PASSWORD] Server now: ${new Date().toISOString()}`);
    if (!expiry || expiry < new Date()) {
      console.log(`[RESET-PASSWORD] Token expired for email: ${email} - expiry check failed`);
      return res.status(400).json({ error: "Reset token has expired" });
    }

    try {
      // Update password and clear token fields
      await db.sql`UPDATE users SET password = ${password}, reset_token = NULL, reset_token_expiry = NULL WHERE id = ${user.id}`;
      console.log(`[RESET-PASSWORD] Password updated for user id: ${user.id}`);
      return res.status(200).json({ message: "Password has been reset" });
    } catch (dbErr) {
      console.error(`[RESET-PASSWORD] DB error while updating password: ${dbErr.message}`);
      return res.status(500).json({ error: "Failed to update password" });
    }
  } catch (err) {
    console.error("[RESET-PASSWORD] Error:", err && err.stack ? err.stack : err.message);
    res.status(500).json({ error: "Password reset failed" });
  }
});

module.exports = router;
