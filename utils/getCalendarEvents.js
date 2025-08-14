// utils/calendarHelpers.js
import { google } from "googleapis";

export async function getCalendarEvents(tokens, startTime, endTime) {
  const { client_id, client_secret, redirect_uris } = JSON.parse(process.env.GOOGLE_CREDENTIALS).web;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oAuth2Client.setCredentials(tokens);

  const calendar = google.calendar({ version: "v3", auth: oAuth2Client });

  try {
    const res = await calendar.events.list({
      calendarId: "primary",
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    return res.data.items || [];
  } catch (error) {
    console.error("❌ Error consultando Google Calendar:", error.message);
    return [];
  }
}
