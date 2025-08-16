// routes/googleAuth.routes.js
import express from "express";
import { google } from "googleapis";
import User from "../models/User.js";
import auth from "../middleware/auth.js";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const token = req.query.auth;
    if (!token) return res.status(401).send("Token is required");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId;

    const { client_id, client_secret, redirect_uris } = JSON.parse(
      process.env.GOOGLE_CREDENTIALS
    ).web;

    await google.registerTestingDevice({
  projectId: 'aqueous-cargo-465512-d4',
  userId: userId,
  deviceType: 'web_server'
});

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ],
      prompt: "consent",
      state: userId,
      include_granted_scopes: true,
    });
    console.log(authUrl)
    res.redirect(authUrl);
  } catch (error) {
    console.error("Auth route error:", error);
    res.status(401).send("Invalid or missing token");
  }
});

router.get("/callback", async (req, res) => {
  try {
    const {code, error} = req.query;

    if (error) {
      // El usuario canceló la autorización
      return res.redirect("/login"); // O la ruta que uses para login
    }
     if (!code) {
      return res.status(400).send("No authorization code provided");
    }
    const randomUsername = `user-${Date.now()}`;
    const randomPassword = crypto.randomBytes(20).toString("hex");
    const { client_id, client_secret, redirect_uris } = JSON.parse(
      process.env.GOOGLE_CREDENTIALS
    ).web;

    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    const { tokens } = await oAuth2Client.getToken(code);
    console.log("✅ Tokens recibidos:", tokens.scope);
    oAuth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    let user = await User.findOne({ email: profile.email });
    if (!user) {
      user = new User({
        email: profile.email,
        name: profile.name,
        username: randomUsername,
        password: randomPassword,
        googleTokens: tokens,
        status: "free",
      });
      await user.save();
    } else {
      user.googleTokens = tokens;
      await user.save();
    }
    const payload = {
      userId: user._id,
      email: user.email,
      username: user.username,
      status: user.status,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    if (tokens.refresh_token) {
      user.googleTokens = tokens;
      await user.save();
    } else {
      console.warn("⚠️ No refresh_token recibido. No se guardarán los tokens.");
    }

    res.redirect(
      `https://www.talochatbot.com/google-success.html?token=${token}&status=${user.status}`
    );
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("❌ Error al conectar con Google Calendar");
  }
});

// Agrega esta ruta para revocar permisos
router.get("/revoke", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user || !user.googleTokens) {
      return res.status(400).send("No Google tokens found");
    }

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oAuth2Client.setCredentials(user.googleTokens);
    await oAuth2Client.revokeCredentials();
    
    // Elimina los tokens del usuario
    user.googleTokens = undefined;
    await user.save();

    res.redirect("/api/googleAuth"); // Redirige para nueva autorización
  } catch (err) {
    console.error("Error revoking token:", err);
    res.status(500).send("Error revoking token");
  }
});

export default router;
