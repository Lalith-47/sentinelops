
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

  // Step 1: Check the service health endpoint.
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(3000),
    });

    latencyMs = Math.round(performance.now() - start);

    if (response.ok) {
      status = "healthy";
    }
  } catch (error) {
    latencyMs = Math.round(performance.now() - start);
  }

  // Step 2: Store the result in PostgreSQL.
  try {
    const result = await pool.query(
      `INSERT INTO service_checks
         (service_name, status, latency_ms)
       VALUES ($1, $2, $3)
       RETURNING id, service_name, status, latency_ms, checked_at`,
      [serviceName, status, latencyMs],
    );

    return res.status(201).json({
      message: "Service check completed",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to store service check:", error.message);

    return res.status(500).json({
      error: "Failed to store service check",
    });
  }
});

export default router;
