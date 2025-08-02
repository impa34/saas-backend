import nodemailer from "nodemailer";
import EmailLog from "../models/EmailLog.js";

export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass:process.env.EMAIL_PASS
      },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        text,
        ...(html && { html })
    }
    try{
await transporter.sendMail(mailOptions)
    await EmailLog.create({to,subject,html})
    }
    catch(e) {
      console.error(e)
    }
  } catch (e) {
    console.error("Error sending email", e)
  }
};
