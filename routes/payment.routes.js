import express from "express";
import Stripe from "stripe";
import bodyParser from "body-parser"; // para raw
import User from "../models/User.js"; // ajustar al modelo real
import auth from "../middleware/auth.js";
import dotenv from "dotenv";
import { sendEmail } from "../utils/sendEmail.js";
import { getPurchaseEmail } from "../utils/emailTemplates.js";
import { getCancelationEmail } from "../utils/emailTemplates.js";
dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/create-checkout-session", auth, async (req, res) => {
  const { plan } = req.body;

  const user = await User.findById(req.user.userId);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  let priceId = null;
  const userId = req.user.userId;
  switch (plan) {
    case "pro":
      priceId = process.env.STRIPE_PRICE_PRO;
      break;
    case "full":
      priceId = process.env.STRIPE_PRICE_FULL;
      break;
    case "lifetime":
      priceId = process.env.STRIPE_PRICE_LIFETIME;
      break;
    default:
      return res.status(400).json({ error: "Invalid plan" });
  }
  console.log("REQ.USER:", req.user);
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: plan === "lifetime" ? "payment" : "subscription",
    customer_email: user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId, plan },
    success_url:
      "http://localhost:5173/payment-success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "http://localhost:5173/payment-cancel",
    client_reference_id: req.user.userId,
  });
console.log("🎯 Datos de session:", session);
  res.json({ url: session.url });
});

// ✅ Webhook debe usar bodyParser.raw
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("⚠️ Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("📡 Webhook recibido:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.client_reference_id;
      const userEmail = session.customer_details?.email;
  const plan = session.metadata?.status || "Pro";

      if (userId) {
        await User.findByIdAndUpdate(userId, { status: "Pro" });
        console.log("✅ Usuario actualizado:", userId);
      } else {
        console.warn("❌ client_reference_id no encontrado");
      }
    }

    try {
    const user = await User.findOne({ email: userEmail });
    if (!user) {
      console.log("Usuario no encontrado para email:", userEmail);
      return res.status(404).send("Usuario no encontrado");
    }

    user.status = plan;
    await user.save();

    await sendEmail({
      to: user.email,
      subject: `Gracias por tu compra - Plan ${plan}`,
      html: getPurchaseEmail(user.username, plan),
    });

    console.log("✅ Usuario actualizado y email enviado:", user.email);
  } catch (e) {
    console.error("❌ Error actualizando usuario:", e);
    return res.status(500).send("Error interno");
  }

    res.status(200).send("✅ Webhook procesado");
  }
);

router.get("/session", async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: "Missing session_id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    const userId = session.metadata.userId;
    const plan = session.mode === "payment" ? "lifetime" : "pro"; // o evalúa por precio

    if (!userId) {
      return res.status(400).json({ error: "User ID missing in metadata" });
    }

    // Actualizar plan del usuario
    await User.findByIdAndUpdate(userId, { plan });

    res.json({ success: true, userId, plan });
  } catch (err) {
    console.error("❌ Error al recuperar sesión Stripe:", err);
    res.status(500).json({ error: "Error retrieving session" });
  }
});

export const webhookHandler = async (req, res) => {
  
const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.log("⚠️  Webhook signature verification failed.", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Aquí debug para ver qué evento llegó
  console.log("Evento recibido:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    // Aquí debes identificar al usuario, probablemente por el email o metadata
    const userEmail = session.customer_details.email;
    console.log("Email cliente en sesión:", userEmail);

    try {
      const user = await User.findOne({ email: userEmail });
      if (!user) {
        console.log("Usuario no encontrado para email:", userEmail);
        return res.status(404).send("Usuario no encontrado");
      }

      // Actualiza status, por ejemplo a "Pro"
      const plan = session.metadata.plan || "pro"; // fallback por si falta
user.status = plan;
      await user.save();
      console.log("Usuario actualizado a Pro:", user.email);
    } catch (e) {
      console.error("Error actualizando usuario:", e);
      return res.status(500).send("Error interno al actualizar usuario");
    }
  }

  res.json({ received: true });
};

router.post("/cancel-subscription", auth, async(req,res) => {
  try{
    const user = await User.findById(req.user.userId)
    if (!user ||user.status === "free") {
      return res.status(400).json({message:"Ya estás en el plan free"})
    }

    user.status="free"
    await user.save()

    await sendEmail({
      to:user.email,
      subject:"Suscripción cancelada",
      html:getCancelationEmail(user.username)
    })
    res.json({message:"Suscripción cancelada"})
  }catch(e) {
    console.error(e)
    res.status(500).json({message:"Server error"})
  }
})

export default router;
