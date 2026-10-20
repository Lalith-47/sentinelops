import express from "express";
import { pool } from "../db.js";

const router = express.Router();

router.get("/latest", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, recorded_at, cpu_percent, memory_percent, disk_percent
             FROM metric_samples
             ORDER BY recorded_at DESC, id DESC
             LIMIT 1`,
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "No metrics have been recorded yet",
      });
    }

    return res.status(200).json({
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Failed to retrieve metrics:", error.message);

    return res.status(500).json({
      error: "Failed to retrieve metrics",
    });
  }
});
router.get("/history", async (req, res) => {
  const requestedLimit = Number(req.query.limit ?? 10);

  if (
    !Number.isInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 100
  ) {
    return res.status(400).json({
      error: "Limit must be an integer between 1 and 100",
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, recorded_at, cpu_percent, memory_percent, disk_percent
             FROM metric_samples
             ORDER BY recorded_at DESC, id DESC
             LIMIT $1`,
      [requestedLimit],
    );

    return res.status(200).json({
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Failed to retrieve metric history:", error.message);

    return res.status(500).json({
      error: "Failed to retrieve metric history",
    });
  }
});
router.post("/", async (req, res) => {
  const { cpu_percent, memory_percent, disk_percent } = req.body;
  const metrics = [cpu_percent, memory_percent, disk_percent];

  const valid = metrics.every(
    (value) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value <= 100 &&
      value >= 0,
  );
  if (!valid) {
    return res.status(400).json({
      error: "Invalid CPU, memory or disk parameters",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO metric_samples
                (cpu_percent, memory_percent, disk_percent)
             VALUES ($1, $2, $3)
             RETURNING id, recorded_at, cpu_percent, memory_percent, disk_percent`,
      metrics,
    );
    return res.status(201).json({
      message: "Metrics recorded successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(
      `Failed to insert in the metrics database\n error: ${error.message} `,
    );
    return res.status(500).json({
      error: "failed to store metrics",
    });
  }
});

export default router;
