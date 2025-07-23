import express from "express";
import { register, verifyOtp, createPassword ,login,logoutUser,forgotPassword,verifyForgotPasswordOtp,ForgotResetPassword, registerForm, resendOtp} from "../../Controllers/user-Controller/User-Auth-Controller.js"
import multer from "multer";
const router = express.Router();


// Configure multer for file upload
const upload = multer({ dest: 'uploads/' });
// Registration Flow
router.post("/register", register);
router.post("/resend-otp", resendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/create-password", createPassword);

//form
router.post("/form",upload.single('profilePicture'),registerForm);
//login
router.post("/login", login);

//logout 
router.post("/logout",logoutUser)

// Forgot Password Flow
router.post('/forgot-password', forgotPassword); 
router.post('/verify-forgot-password-otp', verifyForgotPasswordOtp); 
router.post('/reset-password', ForgotResetPassword);

export default router;


