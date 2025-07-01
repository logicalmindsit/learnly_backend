import User from "../../Models/User-Model/User-Model.js";
import AWS from "aws-sdk";
import fs from "fs";

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Upload File to S3
const uploadToS3 = async (file) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `profile-pictures/${Date.now()}-${file.originalname}`,
    Body: fs.createReadStream(file.path),
    ContentType: file.mimetype,
  };
  return s3.upload(params).promise();
};

// 🟢 Get User Profile
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// 🟡 Update User Profile Details (except profile picture)
export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not authenticated",
      });
    }

    const {
      username, // Changed from firstName, lastName
      email,
      mobile, // Changed from mobileNumber
      fatherName, // Changed from fatherOrHusbandName
      dateofBirth, // Changed from dateOfBirth
      gender,
      bloodGroup,
      address,
      Nationality, // Added
      Occupation, // Added
    } = req.body;

    // Basic validation (you might want more comprehensive validation)
    if (!email || !username) {
      return res
        .status(400)
        .json({ success: false, message: "Username and Email are required" });
    }

    // Optional: Check if the new email already exists for another user
    if (email) {
      const existingUserWithEmail = await User.findOne({
        email: email,
        _id: { $ne: userId }, // Exclude current user
      });
      if (existingUserWithEmail) {
        return res
          .status(400)
          .json({ success: false, message: "Email already in use by another account" });
      }
    }
    
    // Optional: Check if the new username already exists for another user
    if (username) {
        const existingUserWithUsername = await User.findOne({
          username: username,
          _id: { $ne: userId }, // Exclude current user
        });
        if (existingUserWithUsername) {
          return res
            .status(400)
            .json({ success: false, message: "Username already in use by another account" });
        }
      }

    const updateData = {
      username,
      email,
      mobile,
      fatherName,
      dateofBirth: dateofBirth ? new Date(dateofBirth) : null, // Ensure it's a Date object or null
      gender,
      bloodGroup,
      address, // Assuming address is an object { street, city, state, country, zipCode }
      Nationality,
      Occupation,
    };

    // Remove undefined fields so they don't overwrite existing data with nulls if not provided
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
    if (updateData.address && Object.keys(updateData.address).length === 0) {
        delete updateData.address; // Don't send empty address object unless intended
    } else if (updateData.address) {
        Object.keys(updateData.address).forEach(key => updateData.address[key] === undefined && delete updateData.address[key]);
    }


    const updatedUser = await User.findByIdAndUpdate(
      userId, // Find user by ID
      { $set: updateData }, // Update specified fields
      { new: true, runValidators: true, context: 'query' } // Options
    ).select("-password");

    if (!updatedUser) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    // Handle Mongoose validation errors (e.g., unique constraint)
    if (error.name === 'ValidationError') {
        return res.status(400).json({ success: false, message: "Validation failed", errors: error.errors });
    }
    if (error.code === 11000) { // MongoDB duplicate key error
        return res.status(400).json({ success: false, message: "Email or username already exists.", error: error.message });
    }
    res.status(500).json({
      success: false,
      message: "Update failed due to server error",
      error: error.message,
    });
  }
};

// 🔵 Update Profile Picture
export const updateProfilePicture = async (req, res) => {
  try {
    console.log("🖼️ Uploading profile picture for userId:", req.userId);

    if (!req.userId) {
      console.log("⚠️ User ID not provided");
      return res.status(401).json({ message: "Unauthorized: User not authenticated" });
    }

    if (!req.file) {
      console.log("⚠️ No file uploaded");
      return res.status(400).json({ message: "No file uploaded" });
    }

    const uploadResult = await uploadToS3(req.file);
    console.log("📤 Upload to S3 successful:", uploadResult);

    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      {
        profilePicture: {
          public_id: uploadResult.ETag,
          url: uploadResult.Location,
        },
      },
      { new: true }
    ).select("-password");

    if (!updatedUser) {
      console.log("❌ User not found during profile picture update");
      return res.status(404).json({ message: "User not found, cannot update profile picture" });
    }

    // ✅ Remove local file after success
    const filePath = req.file.path; // Path from multer
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("⚠️ Failed to remove local file:", err);
      } else {
        console.log("🧹 Local file removed:", filePath);
      }
    });

    console.log("✅ Profile picture updated for user:", updatedUser._id);
    res.status(200).json({
      message: "Profile picture updated",
      profilePicture: updatedUser.profilePicture,
    });

  } catch (error) {
    console.error("🔥 Error updating profile picture:", error);
    res.status(500).json({ message: "Failed to upload photo", error: error.message });
  }
};
