import express from "express";
import { checkDatabase } from "./db.js";
import metricsRouter from "./routes/metrics.js";
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/metrics", metricsRouter);
app.get("/health/db", async (_req, res) => {
  try {
    const database = await checkDatabase();
    res.status(200).json({
      status: "ok",
      service: "sentinelops-api",
      database: "connected",
      details: database,
    });
  } catch (error) {
    console.log(`Database connection failed: ${error.message}`);
    res.status(503).json({
      status: "error",
      database: "disconnected",
    });
  }
});
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "sentinelops-api",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on PORT: ${PORT}`);
});
