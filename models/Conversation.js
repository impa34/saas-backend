import mongoose from "mongoose"


const conversationSchema = new mongoose.Schema({
    bot:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Chatbot",
        required:true,
    },
    sender:{
        type:String,
        required:true
    },
    message:{
        type:String,
        required:true
    },
    timestamp:{
        type:Date,
        default:Date.now
    }
})

export default mongoose.model("Conversation", conversationSchema)