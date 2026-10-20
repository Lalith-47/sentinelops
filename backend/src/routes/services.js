
import { Router } from "express";
import { performance } from "node:perf_hooks";
import { pool } from "../db.js";

const router = Router();

router.post("/check", async (req, res) => {
  const serviceName = "sentinelops-api";
  const healthUrl = "http://127.0.0.1:3000/health";

  const start = performance.now();
  let status = "unhealthy";
  let latencyMs = null;
  let errorMessage = null;

  // Step 1: Check the service health endpoint.
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(3000),
    });

    latencyMs = Math.round(performance.now() - start);

    if (response.ok) {
      status = "healthy";
    } else {
      errorMessage = `Health endpoint returned HTTP ${response.status}`;
    }
  } catch (error) {
    latencyMs = Math.round(performance.now() - start);
    errorMessage = error.message;
  }

  // Step 2: Save the check and update incidents atomically.
  let client;

  try {
    client = await pool.connect();

    await client.query("BEGIN");

    // Serialize incident updates for this service.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [serviceName],
    );

    const checkResult = await client.query(
      `INSERT INTO service_checks
         (service_name, status, latency_ms)
       VALUES ($1, $2, $3)
       RETURNING id, service_name, status, latency_ms, checked_at`,
      [serviceName, status, latencyMs],
    );

    let incidentAction = "none";

    if (status === "unhealthy") {
      // An acknowledged incident is still active.
      const existingIncident = await client.query(
        `SELECT id
         FROM incidents
         WHERE service_name = $1
           AND status IN ('open', 'acknowledged')
         ORDER BY opened_at DESC, id DESC
         LIMIT 1`,
        [serviceName],
      );

      if (existingIncident.rows.length === 0) {
        const incidentResult = await client.query(
          `INSERT INTO incidents
             (service_name, status, error_message)
           VALUES ($1, 'open', $2)
           RETURNING id, service_name, status, error_message, opened_at`,
          [serviceName, errorMessage ?? "Health check failed"],
        );

        incidentAction = "created";
      } else {
        incidentAction = "already_active";
      }
    } else {
      // Resolve any active incident after recovery.
      const resolvedResult = await client.query(
        `UPDATE incidents
         SET status = 'resolved',
             resolved_at = NOW()
         WHERE service_name = $1
           AND status IN ('open', 'acknowledged')
         RETURNING id`,
        [serviceName],
      );

      if (resolvedResult.rowCount > 0) {
        incidentAction = "resolved";
      }
    }

    await client.query("COMMIT");

    return res.status(201).json({
      message: "Service check completed",
      data: checkResult.rows[0],
      incident_action: incidentAction,
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Transaction rollback failed:", rollbackError.message);
      }
    }

    console.error("Service check transaction failed:", error.message);

    return res.status(500).json({
      error: "Failed to process service check",
    });
  } finally {
    client?.release();
  }
});

router.get("/history", async (req, res) => {
  const rawLimit = req.query.limit ?? "10";
  const limit = Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return res.status(400).json({
      error: "limit must be an integer between 1 and 100",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, service_name, status, latency_ms, checked_at
       FROM service_checks
       ORDER BY checked_at DESC, id DESC
       LIMIT $1`,
      [limit],
    );

    return res.status(200).json({
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Failed to retrieve service-check history:", error.message);

    return res.status(500).json({
      error: "Failed to retrieve service-check history",
    });
  }
});

export default router;
