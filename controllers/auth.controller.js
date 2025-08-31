import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

export const registerUser = async (req, res) => {
  const { username, password, email, country, timeZone } = req.body;

  try {
    const match = await User.findOne({ email });
    if (match) return res.status(401).json({ message: "User already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      country,       // 🌍 Guardar país
      timeZone,      // 🌐 Guardar zona horaria
    });

    const token = jwt.sign(
      {
        userId: newUser._id,
        email: newUser.email,
        username: newUser.username,
        status: newUser.status,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({
      message: "User succesfully registered",
      token,
      user: {
        email: newUser.email,
        username: newUser.username,
        status: newUser.status,
        country: newUser.country,
        timeZone: newUser.timeZone,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Couldn't register" });
  }
};


export const loginUser = async (req, res) => {
  const { email, password, username } = req.body;

  try {
    const match = await User.findOne({ email });

    if (!match) {
      return res.status(401).json({ message: "User not found" });
    }

    const valid = await bcrypt.compare(password, match.password);

    if (!valid) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      {
        userId: match._id,
        email: match.email,
        username: match.username,
        status: match.status,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    return res.status(200).json({
      message: "Logged in succesfully",
      token,
      user: {
        email: match.email,
        username: match.username,
        status: match.status,
      },
    });
  } catch (e) {
    console.log(e);
    return res.status(500).json({ message: `Couldn't log in` });
  }
};
