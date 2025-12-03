const { jwtVerify } = require("jose");
const SECRET = process.env.JWT_SECRET || "your_jwt_secret";

async function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    console.log("[AUTH] No token provided");
    return res.sendStatus(401);
  }
  
  try {
    const secret = new TextEncoder().encode(SECRET);
    const { payload: user } = await jwtVerify(token, secret);
    console.log(
      `[AUTH] Token valid for user: ${user.email}, role: ${user.role}, org_id: ${user.organization_id}`
    );
    req.user = user;
    next();
  } catch (err) {
    console.log("[AUTH] Invalid token:", err.message);
    return res.sendStatus(403);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    console.log(
      `[AUTH] Role check: user role=${
        req.user?.role
      }, required roles=[${roles.join(", ")}]`
    );
    if (!req.user || !roles.includes(req.user.role)) {
      console.log(
        `[AUTH] Role check failed: user role=${
          req.user?.role
        } not in [${roles.join(", ")}]`
      );
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }
    console.log(`[AUTH] Role check passed for ${req.user.role}`);
    next();
  };
}

// Middleware to require organization access for non-super_admin users
function requireOrganizationAccess() {
  return (req, res, next) => {
    console.log(
      `[AUTH] Org access check: user role=${req.user?.role}, org_id=${req.user?.organization_id}`
    );
    if (req.user.role === "super_admin") {
      console.log("[AUTH] Super admin - org access granted");
      return next();
    }

    if (!req.user.organization_id) {
      console.log("[AUTH] Org access denied - no organization_id");
      return res
        .status(403)
        .json({ error: "Forbidden: no organization access" });
    }

    console.log(
      `[AUTH] Org access granted for org_id: ${req.user.organization_id}`
    );
    next();
  };
}

// Helper function to get organization filter condition for SQL queries
function getOrganizationFilter(user) {
  if (user.role === "super_admin") {
    return { hasFilter: false, condition: "" };
  }

  if (!user.organization_id) {
    throw new Error("User has no organization access");
  }

  return {
    hasFilter: true,
    condition: `organization_id = ${user.organization_id}`,
    organizationId: user.organization_id,
  };
}

// Middleware to add organization filter helper to request
function addOrganizationFilter() {
  return (req, res, next) => {
    req.getOrgFilter = () => getOrganizationFilter(req.user);
    next();
  };
}

// Legacy middleware - kept for backward compatibility but deprecated
function filterByOrganization() {
  return (req, res, next) => {
    if (req.user.role === "super_admin") {
      return next();
    }

    req.organizationFilter = `WHERE organization_id = ${req.user.organization_id}`;
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  requireOrganizationAccess,
  filterByOrganization, // deprecated
  addOrganizationFilter,
  getOrganizationFilter,
};
