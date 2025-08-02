import { google } from "googleapis";
import * as chrono from "chrono-node";

export async function addCalendarEvent({ tokens, summary, description }) {
  const { client_id, client_secret, redirect_uris } = JSON.parse(process.env.GOOGLE_CREDENTIALS).web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oAuth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  try {
    const date = chrono.es.parseDate(description);
    if (!date) {
      console.warn("❌ No se pudo interpretar una fecha válida en:", description);
      return null;
    }

    const event = {
      summary,
      description,
      start: {
        dateTime: date.toISOString(),
        timeZone: "Europe/Madrid",
      },
      end: {
        dateTime: new Date(date.getTime() + 30 * 60 * 1000).toISOString(),
        timeZone: "Europe/Madrid",
      },
    };

    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    console.log("✅ Evento creado en Google Calendar:", response.data.htmlLink);
    return response.data.htmlLink;
  } catch (error) {
    console.error("❌ Error al crear el evento en Google Calendar:", error.response?.data || error.message);
    return null;
  }
}
