//Middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const { JWT_SECRET } = process.env;

const verifyToken = async (req, res, next) => {
  try {
    const PATH = req.path;

    if (
      PATH.startsWith("/register") ||
      PATH === "/verify-otp" ||
      PATH === "/resend-otp" ||
      PATH === "/create-password" ||
      PATH === "/login" ||
      PATH === "/profile" ||
      PATH === "/forget-password" ||
      PATH === "/password-otp-verify" ||
      PATH === "/forget-reset-password" ||
      PATH === "/allcourses" ||
      PATH === "/courses/user-view" ||
       /^\/courses\/[^\/]+$/.test(PATH) ||
       PATH === "/form"
    ) {
      return next();
    }

    const authorization = req.headers["authorization"];

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res
        .status(401)
        .json({ message: "Authorization header not found" });
    }

    const token = authorization.split(" ")[1];
    //console.log(token)

    if (!token) {
      return res.status(401).json({ message: "Access token not found" });
    }
    const decodedToken = jwt.verify(token, JWT_SECRET);

    console.log("user :", decodedToken);
    req.userId = decodedToken.id;

    next();
  } catch (error) {
    if (error?.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Access token has expired" });
    }
    return res.status(403).json({ message: "Token verification failed" });
  }
};
export { verifyToken };
