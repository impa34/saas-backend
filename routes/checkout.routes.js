import express from "express";
import fetch from "node-fetch";

const router = express.Router();

router.post("/create-order", async (req, res) => {
  const { plan } = req.body;

  // Definir precios por plan
  const prices = {
    pro: "9.00",
    full: "19.00",
    lifetime: "79.00",
  };

  try {
    // Obtener access token de PayPal
    const auth = Buffer.from(
      process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_SECRET
    ).toString("base64");

    const authRes = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    const { access_token } = await authRes.json();

    // Crear orden
    const orderRes = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: "EUR",
              value: prices[plan],
            },
            description: `${plan} subscription`,
          },
        ],
        application_context: {
          brand_name: "Tu SaaS",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          return_url: "https://www.talochatbot.com/paypal-success", // tu frontend
          cancel_url: "https://www.talochatbot.com/pricing",
        },
      }),
    });

    const orderData = await orderRes.json();

    // Buscar approval_url y devolverlo al front
    const approvalUrl = orderData.links.find((l) => l.rel === "approve").href;

    res.json({ approvalUrl });
  } catch (err) {
    console.error("❌ PayPal create-order error:", err);
    res.status(500).json({ error: "No se pudo crear la orden de PayPal" });
  }
});

export default router;
