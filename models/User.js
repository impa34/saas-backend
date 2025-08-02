import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    email:{
        required: true,
        type: String,
        unique: true
    },
    username: {
        required: true,
        type: String,
        unique: true
    },
    password: {
        required: true,
        type: String,
    },
    status:{
        type:String,
        default:"free"
    },
    googleTokens: {
  type: mongoose.Schema.Types.Mixed,
  default: null,
},
  subscriptionId: String,
  stripeCustomerId: String,
  subscriptionStart: Date,
  subscriptionEnd: Date,
})

export default mongoose.model("User", userSchema)