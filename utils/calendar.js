import { google } from "googleapis";
import { parseDate } from "./parseDate.js";

export async function addCalendarEvent({ tokens, summary, description, durationMinutes = 30 }) {
  const { client_id, client_secret, redirect_uris } = JSON.parse(process.env.GOOGLE_CREDENTIALS).web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oAuth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  try {
    const parsed = parseDate(description, durationMinutes, 10); // buffer 10 min
    if (!parsed) {
      console.warn("❌ No se pudo interpretar una fecha válida en:", description);
      return null;
    }

    // 1️⃣ Comprobar solapamientos
    const existingEvents = await calendar.events.list({
      calendarId: "primary",
      timeMin: parsed.start.toISOString(),
      timeMax: parsed.end.toISOString(),
      singleEvents: true,
      orderBy: "startTime"
    });

    if (existingEvents.data.items.length > 0) {
      console.warn("⚠️ Conflicto: ya existe un evento en ese rango.");
      return null;
    }

    // 2️⃣ Crear evento
    const event = {
      summary,
      description,
      start: {
        dateTime: parsed.start.toISOString(),
        timeZone: "Europe/Madrid",
      },
      end: {
        dateTime: parsed.end.toISOString(),
        timeZone: "Europe/Madrid",
      },
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    console.log("✅ Evento creado:", response.data.htmlLink);
    return response.data.htmlLink;

  } catch (error) {
    console.error("❌ Error al crear el evento:", error.response?.data || error.message);
    return null;
  }
}
