import User from "../Models/User-Model/User-Model.js";
import Payment from "../Models/Payment-Model/Payment-Model.js";
import { calculateEmiStatus } from "../Services/EMI-Utils.js";
import mongoose from "mongoose";

export const checkCourseAccessMiddleware = async (req, res, next) => {
  console.log("0-EMI-accessMiddleware loaded");
  const userId = req.userId;
  console.log("1: userId", userId);
  const courseId = req.params.id;
  console.log("2: courseId", courseId);

  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    console.log("3: Invalid courseId format");
    return res.status(400).json({
      success: false,
      message: "Invalid course ID format",
    });
  }

  try {
    // Full payment check
    console.log("3: Checking for full payment");
    const fullPayment = await Payment.findOne({
      userId,
      courseId,
      paymentStatus: "completed",
      paymentType: { $ne: "emi" },
    });
    console.log("4: fullPayment", fullPayment);

    if (fullPayment) {
      req.courseAccess = {
        hasAccess: true,
        reason: "full_payment",
        accessType: "full",
        paymentType: "full",
        paymentDetails: {
          amount: fullPayment.amount,
          paymentDate: fullPayment.createdAt,
          transactionId: fullPayment.transactionId,
        },
      };
      console.log("5: Full payment found, access granted");
      return next(); // ✅ Grant access
    }

    // EMI access check
    console.log("6: Checking for active EMI plan");
    const user = await User.findOne(
      {
        _id: userId,
        "enrolledCourses.course": courseId,
      },
      { "enrolledCourses.$": 1 }
    ).populate("enrolledCourses.emiPlan");
    console.log(
      "7: user for EMI",
      user?.enrolledCourses?.[0]?.emiPlan ? "EMI plan found" : "No EMI plan"
    );

    if (user && user.enrolledCourses[0]?.emiPlan) {
      console.log("8: EMI plan exists, calculating status");
      const emiPlan = user.enrolledCourses[0].emiPlan;
      const emiStatus = calculateEmiStatus(emiPlan);

      console.log("8.1: EMI status calculated", {
        hasOverduePayments: emiStatus.hasOverduePayments,
        hasAccessToContent: emiStatus.hasAccessToContent,
        planStatus: emiPlan.status,
        totalOverdue: emiStatus.totalOverdue,
        overdueCount: emiStatus.overdueCount,
      });

      if (emiStatus.hasAccessToContent) {
        console.log("8.2: EMI in good standing, access granted");
        req.courseAccess = {
          hasAccess: true,
          reason: "emi_active",
          accessType: "full",
          paymentType: "emi",
          emiStatus: emiStatus,
          emiPlan: emiPlan,
        };
        return next(); // ✅ Grant access
      } else {
        console.log("8.3: EMI overdue or locked, limited access");
        req.courseAccess = {
          hasAccess: false,
          reason: emiStatus.hasOverduePayments ? "emi_overdue" : "emi_locked",
          accessType: "limited",
          paymentType: "emi",
          overdueCount: emiStatus.overdueCount,
          totalOverdue: emiStatus.totalOverdue,
          nextDueAmount: emiStatus.nextDueAmount,
          nextDueDate: emiStatus.nextDueDate,
          emiStatus: emiStatus,
          emiPlan: emiPlan,
        };
        return next(); // Let controller handle the response
      }
    }

    console.log("9: No access, payment required - setting limited access info");

    // Set access info for the controller to handle
    req.courseAccess = {
      hasAccess: false,
      reason: "payment_required",
      accessType: "limited",
      paymentType: "none",
    };
    return next(); // Let controller handle the response
  } catch (error) {
    console.error("10: Error in checkCourseAccessMiddleware:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

export const checkPaymentStatus = async (userId, courseId) => {
  console.log("11: checkPaymentStatus called", userId, courseId);
  const { access } = await checkCourseAccessMiddleware(userId, courseId);
  console.log("12: checkPaymentStatus access", access);
  return access;
};
