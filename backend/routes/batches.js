const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  authenticateToken,
  requireRole,
  addOrganizationFilter,
} = require("../middleware");

// GET all batches
router.get(
  "/",
  authenticateToken,
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const orgFilter = req.getOrgFilter();

      let rows;
      if (orgFilter.hasFilter) {
        rows =
          await db.sql`SELECT * FROM batches WHERE organization_id = ${orgFilter.organizationId}`;
      } else {
        rows = await db.sql`SELECT * FROM batches`;
      }

      res.json(rows);
    } catch (err) {
      console.log("[BATCHES][GET] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST create batch
router.post(
  "/",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      const result =
        await db.sql`INSERT INTO batches (name, organization_id) VALUES (${name}, ${organization_id}) RETURNING id`;
      res.json({ id: result[0].id, name, organization_id });
    } catch (err) {
      console.log("[BATCHES][POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// PUT update batch
router.put(
  "/:id",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { name } = req.body;
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();

      let result;
      if (orgFilter.hasFilter) {
        result =
          await db.sql`UPDATE batches SET name = ${name} WHERE id = ${id} AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result =
          await db.sql`UPDATE batches SET name = ${name} WHERE id = ${id}`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Batch not found or access denied" });
      }

      res.json({ id, name });
    } catch (err) {
      console.log("[BATCHES][PUT] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// DELETE batch
router.delete(
  "/:id",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const id = req.params.id;
      const orgFilter = req.getOrgFilter();
      // Convert ID to number if it's a string
      const batchId = typeof id === "string" ? parseInt(id, 10) : id;

      if (isNaN(batchId)) {
        return res.status(400).json({ error: "Invalid batch ID format" });
      }

      let result;
      if (orgFilter.hasFilter) {
        result =
          await db.sql`DELETE FROM batches WHERE id = ${batchId} AND organization_id = ${orgFilter.organizationId}`;
      } else {
        result = await db.sql`DELETE FROM batches WHERE id = ${batchId}`;
      }

      if (result.rowsAffected === 0) {
        return res
          .status(404)
          .json({ error: "Batch not found or access denied" });
      }

      res.json({ success: true, id: batchId });
    } catch (err) {
      console.log("[BATCHES][DELETE] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// BULK operations for batches
router.post(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { batches } = req.body;
      const orgFilter = req.getOrgFilter();
      const organization_id = orgFilter.hasFilter
        ? orgFilter.organizationId
        : null;

      if (!Array.isArray(batches) || batches.length === 0) {
        return res.status(400).json({ error: "No batches provided." });
      }

      const created = [];
      // Process each batch insert one by one
      for (const batch of batches) {
        console.log("Processing batch:", batch);
        const result =
          await db.sql`INSERT INTO batches (name, organization_id) VALUES (${batch.name}, ${organization_id}) RETURNING id`;
        console.log("Insert result:", result);
        created.push({ id: result[0].id, name: batch.name, organization_id });
      }

      res.json(created);
    } catch (err) {
      console.log("[BATCHES][BULK POST] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.patch(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      const { batches } = req.body;
      const orgFilter = req.getOrgFilter();

      // --- Basic Input Validation ---
      if (!Array.isArray(batches) || batches.length === 0) {
        return res.status(400).json({
          message: 'Invalid request body. Expected a "batches" array.',
        });
      }

      // --- Detailed Results Tracking ---
      const results = {
        updated: [],
        notFound: [],
        errors: [],
      };

      // --- Debug beforeUpdate values ---
      console.log("About to update batches:", JSON.stringify(batches));

      // --- Process Each Update ---
      for (const batch of batches) {
        try {
          // Validate required fields
          if (!batch || typeof batch !== "object" || batch.name === undefined) {
            results.errors.push({
              id: batch?.id || "unknown",
              message: "Invalid batch object or missing name field.",
            });
            continue;
          }

          // Convert ID to number if it's a string
          const id =
            typeof batch.id === "string" ? parseInt(batch.id, 10) : batch.id;

          if (isNaN(id)) {
            results.errors.push({
              id: batch.id,
              message: "Invalid ID format.",
            });
            continue;
          }

          console.log(`Attempting to update batch: id=${id}, name=${batch.name}`);

          // Before update - verify the record exists with organization filter
          let checkRecord;
          if (orgFilter.hasFilter) {
            checkRecord =
              await db.sql`SELECT id FROM batches WHERE id = ${id} AND organization_id = ${orgFilter.organizationId}`;
          } else {
            checkRecord = await db.sql`SELECT id FROM batches WHERE id = ${id}`;
          }

          if (!checkRecord || checkRecord.length === 0) {
            results.notFound.push(id);
            console.log(
              `Batch with id=${id} not found in database or access denied`
            );
            continue;
          }

          // Perform database update with organization filter
          if (orgFilter.hasFilter) {
            await db.sql`UPDATE batches SET name = ${batch.name} WHERE id = ${id} AND organization_id = ${orgFilter.organizationId}`;
          } else {
            await db.sql`UPDATE batches SET name = ${batch.name} WHERE id = ${id}`;
          }

          // Consider the update successful since we verified the record exists
          // and no error was thrown during the update operation
          results.updated.push({ id, name: batch.name });
          console.log(`Successfully updated batch: id=${id}, name=${batch.name}`);

          // Double-check that the update was applied
          const afterUpdate =
            await db.sql`SELECT name FROM batches WHERE id = ${id}`;
          if (afterUpdate && afterUpdate.length > 0) {
            console.log(
              `Verification: batch ${id} now has name "${afterUpdate[0].name}"`
            );
          }
        } catch (updateErr) {
          console.error(`Error updating batch with ID ${batch?.id}:`, updateErr);
          results.errors.push({
            id: batch?.id || "unknown",
            message:
              updateErr.message || "An unexpected error occurred during update.",
          });
        }
      }

      // Send response with detailed results
      res.status(200).json({
        message: `Bulk update process completed. Updated: ${results.updated.length}, Not Found: ${results.notFound.length}, Errors: ${results.errors.length}`,
        results,
      });
    } catch (err) {
      console.log("[BATCHES][BULK PATCH] Error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

router.delete(
  "/bulk",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      // Get direct access to the request body for debugging
      console.log("[BATCHES][BULK DELETE] Raw request body:", req.body);

      const { ids } = req.body;
      const orgFilter = req.getOrgFilter();
      console.log("[BATCHES][BULK DELETE] IDs extracted:", ids);

      // Validate input more thoroughly
      if (!ids) {
        return res
          .status(400)
          .json({ error: "Missing ids property in request body" });
      }

      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }

      if (ids.length === 0) {
        return res.status(400).json({ error: "Empty ids array provided" });
      }

      const results = {
        success: true,
        totalProcessed: ids.length,
        deletedCount: 0,
        notFound: [],
        invalidIds: [],
        errors: [],
      };

      // Process each deletion one by one
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        console.log(
          `[BATCHES][BULK DELETE] Processing ID at position ${i}:`,
          id,
          typeof id
        );

        // Skip null/undefined values
        if (id === null || id === undefined) {
          results.invalidIds.push(id);
          continue;
        }

        try {
          // Force conversion to number
          const batchId = Number(id);

          if (isNaN(batchId)) {
            console.log(`Invalid ID format at position ${i}:`, id);
            results.invalidIds.push(id);
            continue;
          }

          console.log(`Deleting batch with ID: ${batchId} (${typeof batchId})`);

          let result;
          if (orgFilter.hasFilter) {
            result =
              await db.sql`DELETE FROM batches WHERE id = ${batchId} AND organization_id = ${orgFilter.organizationId}`;
          } else {
            result = await db.sql`DELETE FROM batches WHERE id = ${batchId}`;
          }
          console.log("Delete operation result:", result);

          if (result && result.rowsAffected > 0) {
            results.deletedCount++;
            console.log(`Successfully deleted batch with ID: ${batchId}`);
          } else {
            results.notFound.push(batchId);
            console.log(`Batch not found with ID: ${batchId}`);
          }
        } catch (deleteErr) {
          console.error(`Error deleting batch ${id}:`, deleteErr.message);
          results.errors.push({ id, error: deleteErr.message });
        }
      }

      // Update overall success flag if needed
      if (results.deletedCount === 0 && ids.length > 0) {
        results.success = false;
      }

      console.log("Delete operation final results:", results);
      res.status(200).json(results);
    } catch (err) {
      console.error("[BATCHES][BULK DELETE] Unexpected error:", err);
      return res
        .status(500)
        .json({ error: err.message || "An unexpected error occurred" });
    }
  }
);

// POST endpoint for bulk deletion - alternative to DELETE /bulk
router.post(
  "/bulk-delete",
  authenticateToken,
  requireRole("admin", "super_admin"),
  addOrganizationFilter(),
  async (req, res) => {
    try {
      // Get direct access to the request body for debugging
      console.log("[BATCHES][BULK-DELETE] Raw request body:", req.body);

      const { ids } = req.body;
      const orgFilter = req.getOrgFilter();
      console.log("[BATCHES][BULK-DELETE] IDs extracted:", ids);

      // Validate input
      if (!ids) {
        return res
          .status(400)
          .json({ error: "Missing ids property in request body" });
      }

      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: "ids must be an array" });
      }

      if (ids.length === 0) {
        return res.status(400).json({ error: "Empty ids array provided" });
      }

      const results = {
        success: true,
        totalProcessed: ids.length,
        deletedCount: 0,
        notFound: [],
        invalidIds: [],
        constraintErrors: [],
        errors: [],
      };

      // Process each deletion one by one
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        console.log(`Processing ID at position ${i}:`, id, typeof id);

        // Skip null/undefined values
        if (id === null || id === undefined) {
          results.invalidIds.push(id);
          continue;
        }

        try {
          // Force conversion to number
          const batchId = Number(id);

          if (isNaN(batchId)) {
            console.log(`Invalid ID format at position ${i}:`, id);
            results.invalidIds.push(id);
            continue;
          }

          console.log(`Deleting batch with ID: ${batchId} (${typeof batchId})`);

          let result;
          if (orgFilter.hasFilter) {
            result =
              await db.sql`DELETE FROM batches WHERE id = ${batchId} AND organization_id = ${orgFilter.organizationId}`;
          } else {
            result = await db.sql`DELETE FROM batches WHERE id = ${batchId}`;
          }
          console.log("Delete operation result:", result);

          // Check for successful deletion based on changes property
          // SQLite Cloud driver returns changes property instead of rowsAffected
          if (result && (result.changes > 0 || result.rowsAffected > 0)) {
            results.deletedCount++;
            console.log(`Successfully deleted batch with ID: ${batchId}`);
          } else {
            results.notFound.push(batchId);
            console.log(`Batch not found with ID: ${batchId}`);
          }
        } catch (deleteErr) {
          console.error(`Error deleting batch ${id}:`, deleteErr.message);

          // Check for foreign key constraint error
          if (
            deleteErr.message &&
            deleteErr.message.includes("FOREIGN KEY constraint failed")
          ) {
            results.constraintErrors.push({
              id,
              message:
                "Cannot delete this batch because it is referenced by other records (classes, students, etc.)",
            });
            console.log(
              `Foreign key constraint error for batch ${id}: Batch is referenced by other records`
            );
          } else {
            results.errors.push({ id, error: deleteErr.message });
          }
        }
      }

      // Update overall success flag if needed
      if (results.deletedCount === 0 && ids.length > 0) {
        results.success = false;
      }

      console.log("Delete operation final results:", results);
      res.status(200).json(results);
    } catch (err) {
      console.error("[BATCHES][BULK-DELETE] Unexpected error:", err);
      return res
        .status(500)
        .json({ error: err.message || "An unexpected error occurred" });
    }
  }
);

module.exports = router;
