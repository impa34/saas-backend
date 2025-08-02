import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema({
  to: String,
  subject: String,
  html: String,
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("EmailLog", emailLogSchema);
