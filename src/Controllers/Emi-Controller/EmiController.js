//Controllers/Emi-Controller/EmiController.js
import { unlockCourseAccess } from "../../Services/EMI-Service.js";
import EMIPlan from "../../Models/Emi-Plan/Emi-Plan-Model.js";
import Payment from "../../Models/Payment-Model/Payment-Model.js";
import Razorpay from "razorpay";
import dotenv from "dotenv";

dotenv.config();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const payOverdueEmis = async (req, res) => {
  try {
    const userId = req.userId;
    const { courseId, amount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid course ID format",
      });
    }

    // Get EMI plan with overdue payments
    const emiPlan = await EMIPlan.findOne({
      userId,
      courseId,
      status: "locked",
    });

    if (!emiPlan) {
      return res.status(404).json({
        success: false,
        message: "No locked EMI plan found",
      });
    }

    // Calculate overdue amount
    const today = new Date();
    const overdueEmis = emiPlan.emis.filter(
      (emi) => emi.status === "late" && emi.dueDate <= today
    );

    const expectedAmount = overdueEmis.length * 2000;

    if (amount !== expectedAmount) {
      return res.status(400).json({
        success: false,
        message: `Full payment of ₹${expectedAmount} required for ${overdueEmis.length} overdue EMIs`,
      });
    }

    // Create Razorpay order
    const receiptId = `emi_overdue_${Date.now()}`;
    const razorpayOrder = await razorpay.orders.create({
      amount: expectedAmount * 100,
      currency: "INR",
      receipt: receiptId,
    });

    // Simulate payment verification (replace with actual webhook/callback in production)
    const payment = new Payment({
      userId,
      courseId,
      courseName: emiPlan.coursename,
      amount: expectedAmount,
      currency: "INR",
      transactionId: receiptId,
      paymentMethod: "UPI", // Replace with actual method
      razorpayOrderId: razorpayOrder.id,
      paymentStatus: "completed",
      paymentGateway: "razorpay",
      paymentType: "emi_overdue",
    });
    await payment.save();

    // Mark EMIs as paid
    const emiIds = overdueEmis.map((emi) => emi._id);
    await EMIPlan.updateOne(
      { _id: emiPlan._id },
      {
        $set: {
          "emis.$[elem].status": "paid",
          "emis.$[elem].paymentDate": new Date(),
        },
      },
      { arrayFilters: [{ "elem._id": { $in: emiIds } }] }
    );

    // Unlock course
    await unlockCourseAccess(userId, courseId, emiPlan._id);

    res.status(200).json({
      success: true,
      message: "Overdue EMIs paid successfully",
      amount: expectedAmount,
    });
  } catch (error) {
    console.error("Error in emi controller:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process overdue EMIs",
      error: error.message,
    });
  }
};
