// middleware/checkPlan.js
export default function checkPlan(allowedPlans = ["full", "lifetime"]) {
  return (req, res, next) => {
    const user = req.user; // asumiendo que auth ya llenó req.user
    if (!user || !allowedPlans.includes(user.status)) {
      return res.status(403).json({ message: "Acceso denegado: plan insuficiente" });
    }
    next();
  };
}
