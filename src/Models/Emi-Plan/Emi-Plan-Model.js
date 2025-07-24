import mongoose from "mongoose";

const EMISchema = new mongoose.Schema({
  month: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  amount: { type: Number, default: 2000 },
  status: {
    type: String,
    enum: ["pending", "paid", "late"],
    default: "pending",
  },
  paymentDate: Date,
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  gracePeriodEnd: Date,
});

const EMIPlanSchema = new mongoose.Schema(
  {
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
      index: true,
    },
    coursename: { type: String, required: true },
    coursePrice: { type: Number, required: true },
    courseduration: { type: String, required: true },
    username: { type: String, required: true },
    studentRegisterNumber: { type: String, index: true, required: true },
    email: { type: String, index: true },
    mobile: { type: String, index: true},
    totalAmount: { type: Number, required: true },
    emiPeriod: { type: Number, required: true }, // Months (6, 12, or 24)
    selectedDueDay: { type: Number, required: true, min: 1, max: 31 },
    startDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "locked", "completed", "cancelled"],
      default: "active",
    },
    emis: [EMISchema],
    lockHistory: [
      {
        lockDate: { type: Date, required: true },
        unlockDate: Date,
        overdueMonths: { type: Number, required: true },
      },
    ],
  },
  { timestamps: true }
);

EMIPlanSchema.index({ "emis.dueDate": 1, status: 1 });

const EMIPlan = mongoose.model("EMIPlan", EMIPlanSchema);
export default EMIPlan;