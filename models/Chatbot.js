import mongoose from "mongoose"

const chatbotSchema = new mongoose.Schema({
    user: {type: mongoose.Schema.Types.ObjectId, ref: "User", required:true},
    name:{ type:String, required:true},
    prompts:[{
        question:String,
        answer: String
    }], 
    dataset:Array,
    config:{
        backgroundColor:{type:String,default:"#ffffff"},
        textColor:{type:String, default:"#000000"},
        font:{type:String, default:"Poppins"},
        fontSize:{type:Number, default:14}
    },
    telegramChatId: String,
    telegramToken: { type: String, default: null },
    telegramBotUsername: { type: String, default: null }, // ✅ Añadir este campo
    telegramWebhookSet: { type: Boolean, default: false }, // Para tracking
    telegramLastUpdate: { type: Date } // Última interacción
}, { timestamps: true });

export default mongoose.model("Chatbot", chatbotSchema)