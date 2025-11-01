// Controllers/Payment-controller/Payment-Controller.js
import Payment from "../../Models/Payment-Model/Payment-Model.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../../Models/User-Model/User-Model.js";
import CourseNewModel from "../../Models/Course-Model/Course-model.js";
import EMIPlan from "../../Models/Emi-Plan/Emi-Plan-Model.js";
import {
  getEmiDetails,
  validateCourseForEmi,
} from "../../Services/EMI-Utils.js";
import {
  getNextDueDate,
  getMonthNameFromDate,
} from "../../Services/EMI-DateUtils.js";
import { sendNotification } from "../../Notification/EMI-Notification.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const validatePaymentData = (data) => {
  const errors = [];
  if (!data.userId) errors.push("User ID is required");
  if (!data.courseId) errors.push("Course ID is required");
  if (!data.amount || isNaN(data.amount))
    errors.push("Valid amount is required");
  return errors;
};

export const createPayment = async (req, res) => {
  try {
    console.log("1 ==> [createPayment] INIT");
    const userId = req.userId;
    console.log("2 userId", userId);
    const { courseId, amount, paymentMethod, paymentType, emiDueDay } =
      req.body;
    console.log("3 req.body", req.body);

    // Validate input data
    const validationErrors = validatePaymentData({ userId, courseId, amount });
    console.log("4 validationErrors", validationErrors);
    if (validationErrors.length > 0) {
      console.log("5 validation failed");
      return res.status(400).json({ success: false, errors: validationErrors });
    }

    if (paymentType === "emi") {
      console.log("6 paymentType is emi");
      if (
        !emiDueDay ||
        !Number.isInteger(emiDueDay) ||
        emiDueDay < 1 ||
        emiDueDay > 31
      ) {
        console.log("7 emiDueDay invalid", emiDueDay);
        return res
          .status(400)
          .json({ success: false, message: "Invalid EMI due day (1-31)" });
      }
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.log("8 invalid courseId", courseId);
      return res
        .status(400)
        .json({ success: false, message: "Invalid course ID format" });
    }

    // Check if user is already enrolled
    const isEnrolled = await User.exists({
      _id: userId,
      "enrolledCourses.course": courseId,
    });
    console.log("9 isEnrolled", isEnrolled);
    if (isEnrolled) {
      console.log("10 already enrolled");
      return res.status(400).json({
        success: false,
        message: "User already enrolled in this course",
      });
    }

    const [user, course] = await Promise.all([
      User.findById(userId)
        .select("username email mobile studentRegisterNumber")
        .lean(),
      CourseNewModel.findById(courseId)
        .select("coursename price courseduration thumbnail CourseMotherId emi")
        .lean(),
    ]);
    console.log("11 user", user, "course", course);

    if (!user) {
      console.log("12 user not found");
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (!course) {
      console.log("13 course not found");
      return res
        .status(404)
        .json({ success: false, message: "Course not found" });
    }

    let expectedAmount, emiDetails;
    console.log("14 before paymentType check");
    if (paymentType === "emi") {
      console.log("15 paymentType emi block");
      try {
        emiDetails = validateCourseForEmi(course);
        console.log("16 emiDetails", emiDetails);
        expectedAmount = emiDetails.monthlyAmount;
        console.log("17 expectedAmount", expectedAmount);
        if (amount !== expectedAmount) {
          console.log("18 amount mismatch", amount, expectedAmount);
          return res.status(400).json({
            success: false,
            message: `First EMI amount must be ₹${expectedAmount}`,
          });
        }
      } catch (emiError) {
        console.log("EMI validation failed:", emiError.message);
        return res.status(400).json({
          success: false,
          message: emiError.message || "EMI not available for this course",
          errorCode: "EMI_NOT_AVAILABLE",
        });
      }
    } else {
      expectedAmount = course.price.finalPrice;
      console.log("19 expectedAmount", expectedAmount);
      if (amount !== expectedAmount) {
        console.log("20 amount mismatch", amount, expectedAmount);
        return res.status(400).json({
          success: false,
          message: "Amount doesn't match course price",
        });
      }
    }

    // Generate a unique receipt ID
    const receiptId = `receipt_${Date.now()}_${Math.floor(
      Math.random() * 10000
    )}`;
    console.log("21 receiptId", receiptId);

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(expectedAmount * 100),
      currency: "INR",
      receipt: receiptId,
      notes: {
        userId: userId.toString(),
        courseId: courseId.toString(),
        courseName: course.coursename,
        studentRegisterNumber: user.studentRegisterNumber || "N/A",
        email: user.email || "N/A",
        mobile: user.mobile || "N/A",
      },
    });
    console.log("22 razorpayOrder", razorpayOrder);

    // Create payment record
    const payment = new Payment({
      userId,
      courseId,
      CourseMotherId: course.CourseMotherId,
      studentRegisterNumber: user.studentRegisterNumber || "N/A",
      username: user.username,
      email: user.email || "N/A",
      mobile: user.mobile || "N/A",
      courseName: course.coursename,
      amount: expectedAmount,
      currency: "INR",
      transactionId: receiptId, // This should be unique
      paymentMethod,
      razorpayOrderId: razorpayOrder.id,
      ipAddress:
        req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      paymentStatus: "pending",
      paymentGateway: "razorpay",
      paymentType,
      emiDueDay: paymentType === "emi" ? emiDueDay : undefined,
      refundPolicyAcknowledged: true,
    });
    console.log("23 payment obj", payment);

    await payment.save();
    console.log("24 payment saved");

    // Prepare response
    const response = {
      success: true,
      message: "Payment order created successfully",
      order: razorpayOrder,
      paymentId: payment._id,
      courseDetails: {
        name: course.coursename,
        duration: course.courseduration,
        totalAmount: course.price.finalPrice,
        thumbnail:
          course.thumbnail || "https://yourwebsite.com/default-thumbnail.jpg",
        noRefundPolicy: "As per our policy, this course is non-refunded.",
      },
    };
    console.log("25 response obj", response);

    if (paymentType === "emi") {
      console.log("26 paymentType emi response");
      response.emiDetails = {
        monthlyAmount: emiDetails.monthlyAmount,
        totalEmis: emiDetails.months,
        nextDueDate: getNextDueDate(new Date(), emiDueDay, 1),
      };
    }

    console.log("27 sending response");
    return res.status(201).json(response);
  } catch (error) {
    console.error("==> [createPayment] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create payment",
      error: error.message,
    });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    console.log("1 ==> [verifyPayment] INIT");
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      paymentId,
      refundRequested,
    } = req.body;
    console.log("2 req.body", req.body);

    if (
      !razorpay_payment_id ||
      !razorpay_order_id ||
      !razorpay_signature ||
      !paymentId
    ) {
      console.log("3 missing verification fields");
      return res.status(400).json({
        success: false,
        message: "All verification fields are required",
      });
    }

    if (refundRequested) {
      console.log("4 refund requested");
      return res.status(400).json({
        success: false,
        message: "Refunds not permitted as per policy",
      });
    }

    // Verify Razorpay signature for production payment
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // Determine if this is a test payment
    const isTestPayment =
      razorpay_payment_id.startsWith("pay_test_") ||
      razorpay_order_id.startsWith("order_test_") ||
      process.env.NODE_ENV === "development";

    // Verify payment status with Razorpay
    const paymentVerification = await razorpay.payments.fetch(
      razorpay_payment_id
    );

    if (paymentVerification.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment not captured",
        paymentStatus: paymentVerification.status,
      });
    }

    const updatedPayment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        paymentStatus: "completed",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      },
      { new: true }
    );
    console.log("11 updatedPayment", updatedPayment);

    if (!updatedPayment) {
      console.log("12 payment not found");
      return res
        .status(404)
        .json({ success: false, message: "Payment record not found" });
    }

    const course = await CourseNewModel.findById(
      updatedPayment.courseId
    ).select("coursename price courseduration thumbnail CourseMotherId emi");
    console.log("13 course", course);
    const user = await User.findById(updatedPayment.userId).select(
      "username email mobile studentRegisterNumber"
    );
    console.log("14 user", user);
    if (!course || !user) {
      console.log("15 course/user not found");
      return res
        .status(404)
        .json({ success: false, message: "Course/User not found" });
    }

    let emiPlan = null;
    let emiDetails = null;
    if (updatedPayment.paymentType === "emi") {
      console.log("16 paymentType emi");
      emiDetails = getEmiDetails(course);
      console.log("17 emiDetails", emiDetails);
      emiPlan = await createEmiPlan(
        updatedPayment.userId,
        updatedPayment.courseId,
        course,
        user,
        updatedPayment.emiDueDay,
        emiDetails
      );
      console.log("18 emiPlan", emiPlan);

      // Send EMI welcome notification
      await sendNotification(updatedPayment.userId, "welcome", {
        courseName: course.coursename,
        courseDuration: course.courseduration,
        amountPaid: updatedPayment.amount,
        totalAmount: course.price.finalPrice,
        isEmi: true,
        emiTotalMonths: emiDetails.months,
        emiMonthlyAmount: emiDetails.monthlyAmount,
        nextDueDate: getNextDueDate(
          new Date(),
          updatedPayment.emiDueDay,
          1
        ).toDateString(),
        courseUrl: `https://yourwebsite.com/courses/${course._id}`,
        courseThumbnail:
          course.thumbnail || "https://yourwebsite.com/default-thumbnail.jpg",
        noRefundPolicy: "As per our policy, this course is non-refunded.",
      });
      console.log("19 EMI welcome notification sent");
    } else {
      await User.findByIdAndUpdate(
        updatedPayment.userId,
        {
          $addToSet: {
            enrolledCourses: {
              course: updatedPayment.courseId,
              coursename: course.coursename,
              accessStatus: "active",
            },
          },
        },
        { new: true }
      );
      console.log("20 user enrolled");

      // Send full payment welcome notification
      await sendNotification(updatedPayment.userId, "welcome", {
        courseName: course.coursename,
        courseDuration: course.courseduration,
        amountPaid: updatedPayment.amount,
        totalAmount: course.price.finalPrice,
        isEmi: false,
        courseUrl: `https://yourwebsite.com/courses/${course._id}`,
        courseThumbnail:
          course.thumbnail || "https://yourwebsite.com/default-thumbnail.jpg",
        noRefundPolicy: "As per our policy, this course is non-refunded.",
      });
      console.log("21 full payment welcome notification sent");
    }

    await CourseNewModel.findByIdAndUpdate(updatedPayment.courseId, {
      $inc: { studentEnrollmentCount: 1 },
    });
    console.log("22 course enrollment count incremented");

    console.log("23 sending response");
    return res.status(200).json({
      success: true,
      message: "Payment verified and course enrolled successfully",
      payment: updatedPayment,
      courseDetails: {
        name: course.coursename,
        duration: course.courseduration,
        totalAmount: course.price.finalPrice,
        thumbnail:
          course.thumbnail || "https://yourwebsite.com/default-thumbnail.jpg",
        noRefundPolicy: "As per our policy, this course is non-refunded.",
      },
      emiDetails: emiPlan
        ? {
            monthlyAmount: emiDetails.monthlyAmount,
            totalEmis: emiDetails.months,
            nextDueDate: getNextDueDate(
              new Date(),
              updatedPayment.emiDueDay,
              1
            ),
          }
        : null,
      isTestPayment,
    });
  } catch (error) {
    console.error("==> [verifyPayment] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: error.message,
    });
  }
};

export const getEmiDetailsForCourse = async (req, res) => {
  try {
    console.log(
      "1 ==> [getEmiDetailsForCourse] Fetching EMI details for course:",
      req.params.courseId
    );

    const { courseId } = req.params;
    console.log("2 courseId", courseId);

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      console.log("3 invalid courseId", courseId);
      console.warn("==> [getEmiDetailsForCourse] Invalid course ID format");
      return res.status(400).json({
        success: false,
        message: "Invalid course ID format",
      });
    }

    const course = await CourseNewModel.findById(courseId).select(
      "coursename price courseduration"
    );
    console.log("4 course", course);
    if (!course) {
      console.log("5 course not found");
      console.warn("==> [getEmiDetailsForCourse] Course not found");
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const emiDetails = getEmiDetails(course);
    console.log("6 emiDetails", emiDetails);

    console.log("7 sending response");
    return res.status(200).json({
      success: true,
      eligible: emiDetails.eligible,
      monthlyAmount: emiDetails.monthlyAmount,
      totalAmount: emiDetails.totalAmount,
      duration: course.courseduration,
      emiPeriod: emiDetails.months,
      notes: emiDetails.notes,
      emiConfiguration: course.emi,
    });
  } catch (error) {
    console.error("==> [getEmiDetailsForCourse] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// Helper: Create EMI Plan (Optimized) - Exported for webhook use
export const createEmiPlan = async (
  userId,
  courseId,
  course,
  user,
  dueDay,
  emiDetails
) => {
  console.log("==> [createEmiPlan] Creating EMI plan...");
  const emis = [];
  const now = new Date();

  // First EMI (paid now)
  emis.push({
    month: 1,
    monthName: getMonthNameFromDate(now),
    dueDate: now,
    amount: emiDetails.monthlyAmount,
    status: "paid",
    paymentDate: now,
    //gracePeriodEnd: new Date(dueDate.getTime() + 3 * 24 * 60 * 60 * 1000), // 7-day grace period
  });

  // Subsequent EMIs
  for (let month = 2; month <= emiDetails.months; month++) {
    const dueDate = getNextDueDate(now, dueDay, month - 1);
    emis.push({
      month,
      monthName: getMonthNameFromDate(dueDate),
      dueDate,
      amount: emiDetails.monthlyAmount,
      status: "pending",
      gracePeriodEnd: new Date(dueDate.getTime() + 3 * 24 * 60 * 60 * 1000), // 3-day grace period
    });
  }

  const emiPlan = new EMIPlan({
    userId,
    courseId,
    CourseMotherId: course.CourseMotherId,
    coursename: course.coursename,
    coursePrice: course.price.finalPrice,
    courseduration: course.courseduration,
    username: user.username,
    studentRegisterNumber: user.studentRegisterNumber,
    email: user.email,
    mobile: user.mobile,
    totalAmount: emiDetails.totalAmount,
    emiPeriod: emiDetails.months,
    selectedDueDay: dueDay,
    startDate: now,
    status: "active",
    emis,
  });

  const savedPlan = await emiPlan.save();
  console.log("==> [createEmiPlan] EMI plan saved in DB:", savedPlan);

  await User.findByIdAndUpdate(
    userId,
    {
      $addToSet: {
        enrolledCourses: {
          course: courseId,
          coursename: course.coursename,
          emiPlan: savedPlan._id,
          accessStatus: "active",
        },
      },
    },
    { new: true }
  );

  await CourseNewModel.findByIdAndUpdate(courseId, {
    $inc: { studentEnrollmentCount: 1 },
  });

  return savedPlan;
};

// Helper: Enroll user with EMI
const enrollUserWithEmi = async (userId, courseId, courseName, emiPlanId) => {
  await User.findByIdAndUpdate(userId, {
    $addToSet: {
      enrolledCourses: {
        course: courseId,
        coursename: courseName,
        emiPlan: emiPlanId,
        accessStatus: "active",
      },
    },
  });

  await CourseNewModel.findByIdAndUpdate(courseId, {
    $inc: { studentEnrollmentCount: 1 },
  });
};

/**
 * =========== GET APIS
 */

export const getUserPayments = async (req, res) => {
  try {
    console.log("1 ==> [getUserPayments] INIT");
    const userId = req.userId;
    console.log("2 userId", userId);
    const { page = 1, limit = 5, status = "", sort = "-createdAt" } = req.query;
    console.log("3 req.query", req.query);

    // Build the query
    const query = { userId };
    console.log("4 query", query);

    // Status filter
    if (status) {
      console.log("5 status filter", status);
      query.paymentStatus = status;
    }

    // Execute query with pagination
    const [payments, total] = await Promise.all([
      Payment.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate("courseId", "coursename thumbnail duration")
        .lean(),
      Payment.countDocuments(query),
    ]);
    console.log("6 payments", payments, "total", total);

    // Get user's total spending
    const totalSpent = await Payment.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          paymentStatus: "completed",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    console.log("7 totalSpent", totalSpent);

    const completed = await Payment.countDocuments({
      userId,
      paymentStatus: "completed",
    });
    console.log("8 completed", completed);
    const pending = await Payment.countDocuments({
      userId,
      paymentStatus: "pending",
    });
    console.log("9 pending", pending);

    console.log("10 sending response");
    res.status(200).json({
      success: true,
      data: {
        payments,
        summary: {
          totalPayments: total,
          totalSpent,
          completed,
          pending,
        },
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("User get payments error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment history",
      error: error.message,
    });
  }
};

/**
 * @desc    Get single payment details (User)
 * @route   GET /api/user/payments/:id
 * @access  Private
 */
export const getUserPaymentById = async (req, res) => {
  try {
    console.log("1 ==> [getUserPaymentById] INIT");
    const userId = req.userId;
    console.log("2 userId", userId);
    const payment = await Payment.findOne({
      _id: req.params.id,
      userId,
    }).populate("courseId", "coursename price duration instructor");
    console.log("3 payment", payment);

    if (!payment) {
      console.log("4 payment not found");
      return res.status(404).json({
        success: false,
        message: "Payment not found or unauthorized",
      });
    }

    console.log("5 sending response");
    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error("User get payment by ID error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment details",
      error: error.message,
    });
  }
};
