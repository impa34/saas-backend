// en index.js o routes/health.js
import express from "express";
const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

export default router;