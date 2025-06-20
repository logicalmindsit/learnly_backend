import Payment from "../../Models/Payment-Model/Payment-Model.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import User from "../../Models/User-Model/User-Model.js";
import CourseNewModel from "../../Models/Course-Model/Course-model.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const razorpayOrderId = "order_Qb7NCoJ2FIwDIf";
const razorpayPaymentId = "pay_FAKE1234567890";
const keySecret = process.env.RAZORPAY_KEY_SECRET;
let signature;

signature = crypto
  .createHmac('sha256', keySecret)
  .update(`${razorpayOrderId}|${razorpayPaymentId}`)
  .digest('hex');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Utility function to validate payment data
const validatePaymentData = (data) => {
  const errors = [];
  if (!data.userId) errors.push("User ID is required");
  if (!data.courseId) errors.push("Course ID is required");
  if (!data.amount || isNaN(data.amount)) errors.push("Valid amount is required");
  return errors;
};

/**
 * @desc    Create a new payment order
 * @route   POST /api/payments/create
 * @access  Private
 */
export const createPayment = async (req, res) => {
  try {
    const userId = req.userId;
    const { courseId, amount, paymentMethod } = req.body;

    // Validate input
    const validationErrors = validatePaymentData({ userId, courseId, amount });
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        errors: validationErrors 
      });
    }

    // Check if user already enrolled in the course
    const isEnrolled = await User.exists({ 
      id: userId, 
      enrolledCourses: courseId 
    });
    if (isEnrolled) {
      return res.status(400).json({ 
        success: false, 
        message: "User already enrolled in this course" 
      });
    }

    const [user, course] = await Promise.all([
      User.findById(userId).select('username email mobile studentRegisterNumber').lean(),
      CourseNewModel.findById(courseId).select('coursename price').lean(),
    ]);

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }
    if (!course) {
      return res.status(404).json({ 
        success: false, 
        message: "Course not found" 
      });
    }

    // Validate amount matches course price
    const expectedAmount = course.price.finalPrice;
    if (Math.abs(amount - expectedAmount) > 0.01) {
      return res.status(400).json({ 
        success: false, 
        message: "Amount doesn't match course price",
        expectedAmount,
        providedAmount: amount
      });
    }

    // Generate unique receipt ID
    const receiptId = `receipt_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(expectedAmount * 100), // Convert to paise
      currency: "INR",
      receipt: receiptId,
      notes: {
        userId: userId.toString(),
        courseId: courseId.toString(),
        courseName: course.coursename,
        studentRegisterNumber: user.studentRegisterNumber || 'N/A',
        email: user.email || 'N/A',
        mobile: user.mobile || 'N/A'
      }
    });

    // Create payment record
    const payment = new Payment({
      userId,
      courseId,
      studentRegisterNumber: user.studentRegisterNumber || 'N/A',
      username: user.username ,
      email: user.email || 'N/A',
      mobile: user.mobile || 'N/A',
      courseName: course.coursename,
      amount: expectedAmount,
      currency: "INR",
      transactionId: receiptId,
      paymentMethod: paymentMethod ,
      razorpayOrderId: razorpayOrder.id,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      paymentStatus: "pending",
      paymentGateway: "razorpay",
    });

    await payment.save();

    return res.status(201).json({
      success: true,
      message: "Payment order created successfully",
      order: razorpayOrder,
      paymentId: payment._id,
    });
  } catch (error) {
    console.error("Create payment error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment",
      error: error.message
    });
  }
};

/**
 * @desc    Verify payment and enroll user in course
 * @route   POST /api/payments/verify
 * @access  Private
 */
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      paymentId,
    } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature || !paymentId) {
      return res.status(400).json({ 
        success: false, 
        message: "All verification fields are required" 
      });
    }

    // Skip signature verification for test payments
    const isTestPayment = razorpay_payment_id.startsWith('pay_FAKE');
    
    if (!isTestPayment) {
      // Validate Razorpay Signature for real payments
      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (generatedSignature !== razorpay_signature) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid payment signature",
          details: {
            expected: generatedSignature,
            received: razorpay_signature
          }
        });
      }

      // Verify payment with Razorpay API
      const paymentVerification = await razorpay.payments.fetch(razorpay_payment_id);
      if (paymentVerification.status !== "captured") {
        return res.status(400).json({ 
          success: false, 
          message: "Payment not captured",
          paymentStatus: paymentVerification.status 
        });
      }
    }

    // Update payment in database
    const updatedPayment = await Payment.findByIdAndUpdate(
      paymentId,
      {
        paymentStatus: "completed",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      },
      { new: true }
    );

    if (!updatedPayment) {
      return res.status(404).json({ 
        success: false, 
        message: "Payment record not found" 
      });
    }

    // Enroll user in course
    await User.findByIdAndUpdate(
      updatedPayment.userId,
      { $addToSet: { enrolledCourses: updatedPayment.courseId } },
      { new: true }
    );

    // Increment course enrollment count
    await CourseNewModel.findByIdAndUpdate(
      updatedPayment.courseId,
      { $inc: { studentEnrollmentCount: 1 } }
    );

    res.status(200).json({
      success: true,
      message: "Payment verified and course enrolled successfully",
      payment: updatedPayment,
      isTestPayment // Indicate if this was a test payment
    });
  } catch (error) {
    console.error("Verify Payment Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Payment verification failed",
      error: error.message 
    });
  }
};






export const getUserPayments = async (req, res) => {
  try {
    const userId = req.userId;
    const { 
      page = 1, 
      limit = 5, 
      status = '',
      sort = '-createdAt' 
    } = req.query;

    // Build the query
    const query = { userId };
    
    // Status filter
    if (status) {
      query.paymentStatus = status;
    }

    // Execute query with pagination
    const [payments, total] = await Promise.all([
      Payment.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .populate('courseId', 'coursename thumbnail duration')
        .lean(),
      Payment.countDocuments(query)
    ]);

    // Get user's total spending
    // const totalSpent = await Payment.aggregate([
    //   { $match: { userId: mongoose.Types.ObjectId(userId), paymentStatus: 'completed' } },
    //   { $group: { _id: null, total: { $sum: '$amount' } } }
      // ]).then(res => res[0]?.total || 0);
      
      const totalSpent = await Payment.aggregate([
  { $match: { userId: new mongoose.Types.ObjectId(userId), paymentStatus: 'completed' } },
  { $group: { _id: null, total: { $sum: '$amount' } } }
])


    res.status(200).json({
      success: true,
      data: {
        payments,
        summary: {
          totalPayments: total,
          totalSpent,
          completed: await Payment.countDocuments({ userId, paymentStatus: 'completed' }),
          pending: await Payment.countDocuments({ userId, paymentStatus: 'pending' })
        },
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('User get payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message
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
    const userId = req.userId;
    const payment = await Payment.findOne({
      _id: req.params.id,
      userId
    }).populate('courseId', 'coursename price duration instructor');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found or unauthorized'
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('User get payment by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
      error: error.message
    });
  }
};







