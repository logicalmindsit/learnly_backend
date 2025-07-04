import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    // User & Course References
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    // Basic Metadata
    username: { type: String, required: true },
    studentRegisterNumber: {type: String,index: true},
    email: { type: String, index: true }, 
    mobile: { type: String, index: true },

    // Course Information
    courseName: { type: String, required: true },
    // Payment Information
    amount: { type: Number, required: true,
    min: 0,set: v => parseFloat(v.toFixed(2))
    },
    currency: {
      type: String,
      enum: ["INR", "USD"],
      default: "INR",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
      index: true
    },
    transactionId: {
      type: String,
      unique: true,
      required: true,
    },
    paymentMethod: {
      type: String,
      enum: ["UPI","CARD","DEBIT_CARD","CREDIT_CARD","NETBANKING","WALLET","EMI","COD","PAYLATER","BANK_TRANSFER","QR_CODE","AUTO_DEBIT"],
      required: true,
    },
    paymentGateway: {
      type: String,
      default: "razorpay",
    },
    // Razorpay Specific Fields (optional for other gateways)
    razorpayOrderId: {
      type: String,
      index: true,
    },
    razorpayPaymentId: String,
    razorpaySignature: String,

    // Device & Technical Info
    ipAddress: String,
    platform: {
      type: String,
      enum: ["web", "android", "ios"],
      default: "web",
    },
    isInternational: {
      type: Boolean,
      default: false,
    },

    // Optional Gateway Details
    cardDetails: {
      cardBrand: String,   // VISA, MasterCard, etc.
      last4: String,       // Last 4 digits of card
      bank: String,
    },
    upiDetails: {
      upiId: String,
      payerName: String,
    },
    bankDetails: {
      bankName: String,
      accountNumberMasked: String,
      ifscCode: String,
    },
    walletProvider: String,

    // Refund and Failure Logs
    failureReason: String,
    refundStatus: {
      type: String,
      enum: ["not_requested", "requested", "processed", "failed"],
      default: "not_requested",
    },
    refundDate: Date,
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
