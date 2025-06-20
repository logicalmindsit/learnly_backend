import express from "express";
import multer from "multer";
import {
  getUserProfile,
  updateUserProfile,
  updateProfilePicture,
} from "../../Controllers/user-Controller/user-profile-controller.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); 
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

router.get("/profiles", getUserProfile); // Add verifyToken if needed
router.put("/putprofile",  updateUserProfile); // Add verifyToken if needed
router.put(
  "/profile-picture",upload.single("profilePicture"),updateProfilePicture);

export default router;