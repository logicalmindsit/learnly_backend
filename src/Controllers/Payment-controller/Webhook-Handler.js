//Controllers/Payment-controller/Webhook-Handler.js
import crypto from "crypto";
import dotenv from "dotenv";
import Payment from "../../Models/Payment-Model/Payment-Model.js";
import EMIPlan from "../../Models/Emi-Plan/Emi-Plan-Model.js";
import User from "../../Models/User-Model/User-Model.js";
import Course from "../../Models/Course-Model/Course-model.js";
import { createEmiPlan } from "../Payment-controller/Payment-Controller.js";
import {
  updateEmiAfterPayment,
  createEmiPaymentRecord,
} from "../../Services/EMI-Utils.js";

dotenv.config();

// Webhook signature verification
const verifyWebhookSignature = (body, signature) => {
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(signature, "hex")
  );
};

// Main webhook handler
export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    // Verify webhook signature
    if (!verifyWebhookSignature(req.body, signature)) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const { event, payload } = req.body;

    switch (event) {
      case "payment.captured":
        await handlePaymentCaptured(payload.payment.entity);
        break;

      case "payment.failed":
        await handlePaymentFailed(payload.payment.entity);
        break;

      case "order.paid":
        await handleOrderPaid(payload.order.entity);
        break;

      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    res.status(200).json({ success: true, message: "Webhook processed" });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

// Handle successful payment capture
const handlePaymentCaptured = async (paymentData) => {
  try {
    const {
      id: razorpayPaymentId,
      order_id: razorpayOrderId,
      amount,
      method,
    } = paymentData;

    // Find the payment record
    const payment = await Payment.findOne({
      razorpayOrderId,
      paymentStatus: "pending",
    });

    if (!payment) {
      console.error("Payment record not found for order:", razorpayOrderId);
      return;
    }

    // Update payment status
    payment.paymentStatus = "completed";
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.paymentMethod = method.toUpperCase();
    await payment.save();

    // Handle course enrollment based on payment type
    if (payment.paymentType === "emi") {
      await handleEmiEnrollment(payment);
    } else {
      await handleFullPaymentEnrollment(payment);
    }

    console.log(`Payment captured successfully: ${razorpayPaymentId}`);
  } catch (error) {
    console.error("Error handling payment capture:", error);
  }
};

// Handle EMI enrollment after payment
const handleEmiEnrollment = async (payment) => {
  try {
    const [user, course] = await Promise.all([
      User.findById(payment.userId),
      Course.findById(payment.courseId),
    ]);

    if (!user || !course) {
      throw new Error("User or course not found");
    }

    // Create EMI plan (you'll need to export this function from Payment-Controller.js)
    const emiPlan = await createEmiPlan(
      payment.userId,
      payment.courseId,
      course,
      user,
      payment.emiDueDay,
      {
        monthlyAmount: payment.amount,
        totalAmount: course.price.finalPrice,
        months: Math.ceil(course.price.finalPrice / payment.amount),
      }
    );

    console.log(`EMI plan created for payment: ${payment._id}`);
  } catch (error) {
    console.error("Error handling EMI enrollment:", error);
  }
};

// Handle full payment enrollment
const handleFullPaymentEnrollment = async (payment) => {
  try {
    // Update user's enrolled courses
    await User.findByIdAndUpdate(payment.userId, {
      $addToSet: {
        enrolledCourses: {
          course: payment.courseId,
          coursename: payment.courseName,
          accessStatus: "active",
        },
      },
    });

    // Update course enrollment count
    await Course.findByIdAndUpdate(payment.courseId, {
      $inc: { studentEnrollmentCount: 1 },
    });

    console.log(
      `Full payment enrollment completed for payment: ${payment._id}`
    );
  } catch (error) {
    console.error("Error handling full payment enrollment:", error);
  }
};

// Handle failed payments
const handlePaymentFailed = async (paymentData) => {
  try {
    const {
      order_id: razorpayOrderId,
      error_code,
      error_description,
    } = paymentData;

    // Update payment status to failed
    await Payment.findOneAndUpdate(
      { razorpayOrderId },
      {
        paymentStatus: "failed",
        errorCode: error_code,
        errorDescription: error_description,
      }
    );

    console.log(`Payment failed for order: ${razorpayOrderId}`);
  } catch (error) {
    console.error("Error handling payment failure:", error);
  }
};

// Handle order paid event
const handleOrderPaid = async (orderData) => {
  try {
    const { id: razorpayOrderId, amount_paid } = orderData;

    // Additional verification can be done here
    console.log(`Order paid: ${razorpayOrderId}, Amount: ${amount_paid}`);
  } catch (error) {
    console.error("Error handling order paid:", error);
  }
};

export default {
  handleRazorpayWebhook,
};
