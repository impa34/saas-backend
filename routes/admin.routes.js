// en routes/admin.js o similar
import EmailLog from "../models/EmailLog.js";
import express from "express"
const router = express.Router()


router.get("/email-logs", async (req, res) => {
  try {
    const logs = await EmailLog.find().sort({ timestamp: -1 }).limit(50);
    res.json(logs);
  } catch (e) {
    res.status(500).json({ message: "Error al recuperar logs" });
  }
});

export default router