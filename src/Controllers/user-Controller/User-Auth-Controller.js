import { sendOtpEmail } from "../../Utils/EmailTransport.js";
import { sendOtpSMS } from "../../Utils/MobileTranspost.js";
import User from "../../Models/User-Model/User-Model.js";
import { generateOtp } from "../../Utils/OTPGenerate.js";
import { JwtToken } from "../../Utils/JwtToken.js";
import {
  isValidEmail,
  isValidPassword,
  isValidMobile,
} from "../../Utils/validate.js";
import bcrypt from "bcrypt";
import AWS from "aws-sdk";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

//register user
export const register = async (req, res) => {
  try {
    const { email, mobile } = req.body;

    if (email && !isValidEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format." });
    }

    if (mobile && !isValidMobile(mobile)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mobile number format. Include country code.",
      });
    }

    if (!email && !mobile) {
      return res
        .status(400)
        .json({ success: false, message: "Email or mobile is required." });
    }

    if (email && mobile) {
      return res.status(400).json({
        success: false,
        message: "Provide only one: email or mobile.",
      });
    }

    const query = email ? { email } : { mobile };
    const existingUser = await User.findOne(query);

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User  with these credentials already exists.",
      });
    }
    const { otp, otpExpiresAt } = generateOtp();
    const newUser = new User({
      ...query,
      registerOtp: otp,
      registerOtpExpiresAt: otpExpiresAt,
    });

    const result = email
      ? await sendOtpEmail(email, otp)
      : await sendOtpSMS(mobile, otp);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: `Failed to send OTP. ${result.message}`,
      });
    }

    await newUser.save();
    return res
      .status(200)
      .json({ success: true, message: `OTP sent to ${email || mobile}` });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// verify otp
export const verifyOtp = async (req, res) => {
  const { email, mobile, otp } = req.body;

  if (email && !isValidEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid email format." });
  }

  try {
    const query = email ? { email } : { mobile };

    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (
      user.registerOtp !== otp.toString() ||
      new Date() > new Date(user.registerOtpExpiresAt)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    const updatedUser = await User.findOneAndUpdate(
      query,
      {
        registerOtpVerified: true,
        registerOtp: undefined,
        registerOtpExpiresAt: undefined,
      },
      { new: true }
    );

    return res
      .status(200)
      .json({ success: true, message: "OTP verified successfully" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.mesage,
    });
  }
};

// create password
export const createPassword = async (req, res) => {
  try {
    const { email, mobile, password } = req.body;

    if (email && !isValidEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format." });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be 8+ characters with a mix of uppercase, lowercase, number & special character.",
      });
    }

    const query = email ? { email } : { mobile };

    const user = await User.findOne(query).lean();

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.registerOtpVerified) {
      return res
        .status(400)
        .json({ success: false, message: "Please verify OTP first" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id },
      { password: hashedPassword },
      { new: true }
    );

    return res
      .status(200)
      .json({ success: true, message: "Password created successfully" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Upload file to S3
const uploadToS3 = (file) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `staff-profiles/${Date.now()}-${file.originalname}`,
    Body: fs.createReadStream(file.path),
    ContentType: file.mimetype,
  };

  return s3.upload(params).promise();
};

// register user
export const registerForm = async (req, res) => {
  try {
    // Extract and validate form data
    const {
      email,
      mobile,
      username,

      fatherName,
      dateofBirth,
      gender,
      address,
      bloodGroup,
      Nationality,
      Occupation,
    } = req.body;

    const requiredFields = {
      email,
      username,

      fatherName,
      dateofBirth,
      gender,
      address,
      bloodGroup,
      Nationality,
      Occupation,
    };

    const missingFields = Object.entries(requiredFields)
      .filter(
        ([key, value]) => value === undefined || value === null || value === ""
      )
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`,
      });
    }

    if (!email && !mobile) {
      return res.status(400).json({
        success: false,
        message: "Email or mobile is required",
      });
    }

    // Find user
    const query = email ? { email } : { mobile };
    const user = await User.findOne(query);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found. Please complete registration first.",
      });
    }

    // Check registration completion
    if (!user.registerOtpVerified || !user.password) {
      return res.status(400).json({
        success: false,
        message: "Please complete the registration process first",
      });
    }

    // Validate date format if provided
    if (req.body.dateofBirth) {
      const dob = new Date(req.body.dateofBirth);
      if (isNaN(dob.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date of birth format",
        });
      }
      req.body.dateofBirth = dob;
    }

    // Prepare update data
    const updateData = {
      username,

      fatherName: req.body.fatherName || null,
      dateofBirth: req.body.dateofBirth || null,
      gender: req.body.gender || null,
      address: {
        street: req.body.address?.street || null,
        city: req.body.address?.city || null,
        state: req.body.address?.state || null,
        country: req.body.address?.country || null,
        zipCode: req.body.address?.zipCode || null,
      },
      bloodGroup: req.body.bloodGroup || null,
      Nationality: req.body.Nationality || null,
      Occupation: req.body.Occupation || null,
    };

    // Handle file upload if present
    if (req.file) {
      const result = await uploadToS3(req.file);
      updateData.profilePicture = {
        public_id: result.Key,
        url: result.Location,
      };
      fs.unlinkSync(req.file.path);
    }

    // Update user
    const updatedUser = await User.findOneAndUpdate(query, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -registerOtp -forgotPasswordOtp");

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    // Delete uploaded file if error occurred after upload
    if (req.file?.path) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

//login
export const login = async (req, res) => {
  const { email, mobile, password } = req.body;

  if (mobile && !isValidMobile(mobile)) {
    return res.status(400).json({
      success: false,
      message: "Invalid mobile number format. Include country code.",
    });
  }

  if (email && !isValidEmail(email)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid email format." });
  }

  if (!isValidPassword(password)) {
    return res.status(400).json({
      success: false,
      message:
        "Password must be 8+ characters with a mix of uppercase, lowercase, number & special character.",
    });
  }

  if (!(email || mobile) || !password) {
    return res.status(400).json({
      success: false,
      message: "Email/Mobile and password are required",
    });
  }

  try {
    const query = email ? { email } : { mobile };

    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (!user.registerOtpVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify OTP before logging in",
      });
    }

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: "Password not set. Please reset your password.",
      });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: "Incorrect email/mobile or password. Please try again",
      });
    }

    const token = JwtToken(user);
    return res.status(200).json({
      success: true,
      message: "Login successful! Welcome back.",
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

//forgot password api
export const forgotPassword = async (req, res) => {
  try {
    const { email, mobile } = req.body;

    if (email && !isValidEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format." });
    }

    if (mobile && !isValidMobile(mobile)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid mobile number format." });
    }

    if (!email && !mobile) {
      return res
        .status(400)
        .json({ success: false, message: "Email or mobile is required." });
    }

    const query = email ? { email } : { mobile };
    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found." });
    }

    // Generate OTP
    const { otp, otpExpiresAt } = generateOtp();

    // Save OTP to user document
    user.forgotPasswordOtp = otp;
    user.forgotPasswordOtpExpiresAt = otpExpiresAt;
    user.forgotPasswordOtpVerified = false;
    await user.save();

    const result = email
      ? await sendOtpEmail(email, otp)
      : await sendOtpSMS(mobile, otp);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: `Failed to send OTP. ${result.message}`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `OTP sent to ${email || mobile} for password reset`,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// verifyforgetpassword
export const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, mobile, otp } = req.body;

    if (email && !isValidEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format." });
    }

    if (mobile && !isValidMobile(mobile)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid mobile number format." });
    }

    const query = email ? { email } : { mobile };

    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    // Check OTP
    if (
      user.forgotPasswordOtp !== otp.toString() ||
      new Date() > new Date(user.forgotPasswordOtpExpiresAt)
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP" });
    }

    // Mark OTP as verified
    user.forgotPasswordOtpVerified = true;
    user.forgotPasswordOtp = undefined;
    user.forgotPasswordOtpExpiresAt = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

//forget password
export const ForgotResetPassword = async (req, res) => {
  try {
    const { email, mobile, newPassword } = req.body;

    if (email && !isValidEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email format." });
    }

    if (mobile && !isValidMobile(mobile)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid mobile number format." });
    }

    if (!isValidPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be 8+ characters with a mix of uppercase, lowercase, number & special character.",
      });
    }

    const query = email ? { email } : { mobile };
    const user = await User.findOne(query);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    if (!user.forgotPasswordOtpVerified) {
      return res
        .status(400)
        .json({ success: false, message: "Please verify OTP first" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and reset OTP fields
    user.password = hashedPassword;
    user.forgotPasswordOtpVerified = false;
    await user.save();

    return res
      .status(200)
      .json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

//logout
export const logoutUser = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User  not found" });
    }

    const currentTime = new Date();

    // Find the latest login session without a logoutTime
    const latestSession = user.loginHistory.find(
      (session) => !session.logoutTime
    );
    if (latestSession) {
      latestSession.logoutTime = currentTime;
      latestSession.sessionDuration = Math.floor(
        (currentTime - latestSession.loginTime) / (1000 * 60)
      ); // in minutes
    }

    user.status = "logged-out";
    user.lastLogout = currentTime; // Update last logout time
    await user.save();

    // Calculate days since last logout
    const daysSinceLogout = Math.floor(
      (currentTime - user.lastLogout) / (1000 * 60 * 60 * 24)
    );

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
      daysSinceLogout: daysSinceLogout, // Return days since last logout
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};
