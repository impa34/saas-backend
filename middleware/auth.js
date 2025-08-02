import jwt from "jsonwebtoken";

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
console.log("Headers:", req.headers);
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token required" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      username: decoded.username,
    };
    next();
  } catch (e) {
    console.error(e);
    return res.status(401).json({ message: "Invalid token" });
  }
};

export default auth;
