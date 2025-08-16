import express from "express";
import dotenv from "dotenv";
dotenv.config();
import cors from "cors";
import mongoose from "mongoose";
import authRoutes from "./routes/auth.routes.js";
import chatRoutes from "./routes/chatbot.routes.js";
import googleRoutes from "./routes/googleAuth.routes.js";
import paymentRoutes from "./routes/payment.routes.js"
import userRoutes from "./routes/user.routes.js"
import adminRoutes from "./routes/admin.routes.js"
import checkoutRoutes from "./routes/checkout.routes.js"
import path from "path";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import { webhookHandler } from "./routes/payment.routes.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

app.post("/api/stripe/webhook", bodyParser.raw({ type: "application/json" }), webhookHandler);

app.use(express.json());
app.use(cors({
  origin: ["https://talochatbot.com", "https://www.talochatbot.com"],
  credentials: true,
}));

app.use("/api/auth", authRoutes);
app.use("/api/google-auth", googleRoutes);
app.use("/api/chatbots", chatRoutes);
app.use("/api/stripe", paymentRoutes);
app.use("/api/paypal", checkoutRoutes);
app.use("/api/user", userRoutes)
app.use("/api/admin", adminRoutes)



app.use(express.static(path.join(__dirname, "../client/dist")));
app.use(express.static(path.join(__dirname, "../client/public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname,"..","client", "dist", "index.html"));
});
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("DB connected");

    app.listen(3000, () => {
      console.log("Server on port 3000");
      setTimeout(() => {
        if (!app._router) {
          console.error("app._router todavía no existe.");
          return;
        }
      }, 100);
    });
  })
  .catch((e) => console.error(e));
