import express from "express"
const router = express.Router()
import auth from "../middleware/auth.js"
import { loginUser, registerUser } from "../controllers/auth.controller.js"
import User from "../models/User.js"
import {google} from "googleapis"
import jwt from "jsonwebtoken"


router.get("/google", (req,res) => {
    const {client_id, client_secret, redirect_uris} = JSON.parse(process.env.GOOGLE_CREDENTIALS).web
    const oAuth2Client = new google.auth.OAuth2(client_id,client_secret, redirect_uris[0])

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type:"offline",
        scope:["profile", "email"],
        prompt:"consent"
    })
res.redirect(authUrl)
})

router.get("/google/callback", async(req,res) => {
    try{
        const {code} = req.query
        const {client_id, client_secret, redirect_uris} = JSON.parse(process.env.GOOGLE_CREDENTIALS).web
         const oAuth2Client = new google.auth.OAuth2(client_id,client_secret, redirect_uris[0])

        const {tokens} = await oAuth2Client.getToken(code)
        oAuth2Client.setCredentials(tokens)
        
        const oauth2 = google.oauth2({version:"v2", auth:oAuth2Client})
        const {data:profile} = await oauth2.userinfo.get()
        
        let user = await User.findOne({email: profile.email})

        if(!user) {
            user = new User({email:profile.email, name: profile.name})
            await user.save()
        }

        const token = jwt.sign({userId:user._id}, process.env.JWT_SECRET, {
            expiresIn:"7d"
        })
        res.send(`
      <script>
        localStorage.setItem("token", "${token}");
        localStorage.setItem("googleLoggedIn", "true");
        window.location.href = "/";
      </script>
    `)
    }catch(e) {
        console.error(e)
        res.status(500).json({message:"Server error"})
    }
})

router.post("/login", loginUser)

router.post("/register", registerUser)

router.get("/home", auth, async(req,res) => {
    const user = await User.findById(req.user.userId)
    res.json({Message:`Welcome ${user.username}`})
})

export default router;