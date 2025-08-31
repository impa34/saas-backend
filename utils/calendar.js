// utils/calendarHelpers.js
import { google } from "googleapis";

export async function addCalendarEvent({ 
  tokens, 
  summary, 
  description, 
  durationMinutes = 30,
  startTime,
  timeZone = "UTC", // 👈 ahora configurable
}) {
  const { client_id, client_secret, redirect_uris } = JSON.parse(process.env.GOOGLE_CREDENTIALS).web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oAuth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  try {
    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60000);

    const event = {
      summary,
      description,
      start: {
        dateTime: start.toISOString(),
        timeZone, // 👈 se usa la zona horaria real
      },
      end: {
        dateTime: end.toISOString(),
        timeZone,
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
