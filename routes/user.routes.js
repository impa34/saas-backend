import express from "express";
import User from "../models/User.js"; // Ajusta a tu modelo
import auth from "../middleware/auth.js"; // JWT middleware
const router = express.Router();
router.get("/me", auth, async (req, res) => {

  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json(user);
  } catch (err) {
    console.error("❌ Error obteniendo usuario:", err);
    res.status(500).json({ error: "Server error" });
  }
});


export default router;
