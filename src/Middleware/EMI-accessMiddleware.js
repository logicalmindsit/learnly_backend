

import User from "../Models/User-Model/User-Model.js";
import Payment from "../Models/Payment-Model/Payment-Model.js";
import mongoose from "mongoose";

export const checkCourseAccessMiddleware = async (req, res, next) => {
  const userId = req.userId;
  const courseId = req.params.id;

  // Validate courseId
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid course ID format",
    });
  }

  try {
    // Full payment check
    const fullPayment = await Payment.findOne({
      userId,
      courseId,
      paymentStatus: "completed",
      paymentType: { $ne: "emi" },
    });

    if (fullPayment) {
      req.courseAccess = { access: true, reason: "full_payment" };
      return next();
    }

    // EMI access check
    const user = await User.findOne(
      {
        _id: userId,
        "enrolledCourses.course": courseId,
      },
      { "enrolledCourses.$": 1 }
    ).populate("enrolledCourses.emiPlan");

    if (user && user.enrolledCourses[0]?.emiPlan?.status === "active") {
      req.courseAccess = { access: true, reason: "emi_active" };
      return next();
    }

    req.courseAccess = { access: false, reason: "payment_required" };
    return next();
  } catch (error) {
    console.error("Error in checkCourseAccessMiddleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const checkPaymentStatus = async (userId, courseId) => {
  const { access } = await checkCourseAccessMiddleware(userId, courseId);
  return access;
};