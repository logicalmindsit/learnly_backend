//Models/Course-Model/Course-model.js
import mongoose from "mongoose";

const MediaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
  },
  { _id: false, timestamps: true }
);

const lessonSchema = new mongoose.Schema(
  {
    lessonname: { type: String, required: true },
    audioFile: [MediaSchema],
    videoFile: [MediaSchema],
    pdfFile: [MediaSchema],
  },
  { timestamps: true }
);

const chapterSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    lessons: [lessonSchema],
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamQuestion",
    },
  },
  { timestamps: true }
);

const instructorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    role: String,
    socialmedia_id: String,
  },
  { _id: false }
);
// EMI Schema (for students)
const emiSchema = new mongoose.Schema(
  {
    isAvailable: { type: Boolean, default: false }, // whether EMI is available
    emiDurationMonths: { type: Number, default: null }, // e.g. 6, 12, 24 months
    monthlyAmount: { type: Number }, // admin defined monthly emi amount
    totalAmount: { type: Number }, // total amount to be paid via EMI
    notes: { type: String }, // admin remarks or conditions
  },
  { _id: false }
);

const courseSchema = new mongoose.Schema(
  {
    CourseMotherId: { type: String, required: true },
    coursename: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    courseduration: {
      type: String,
      enum: ["6 months", "1 year", "2 years"],
      required: true,
    },
    thumbnail: { type: String },
    previewvedio: { type: String },
    contentduration: {
      hours: { type: Number, default: 0 },
      minutes: { type: Number, default: 0 },
    },
    chapters: [chapterSchema],
    price: {
      amount: { type: Number, required: true },
      currency: { type: String, required: true, default: "INR" },
      discount: { type: Number, default: 0, min: 0, max: 100 },
      finalPrice: { type: Number },
    },
    emi: emiSchema,
    level: {
      type: String,
      enum: ["beginner", "medium", "hard"],
      required: true,
    },
    language: {
      type: String,
      enum: ["english", "tamil"],
      required: true,
    },
    certificates: {
      type: String,
      enum: ["yes", "no"],
      required: true,
    },
    instructor: instructorSchema,
    description: { type: String },
    whatYoullLearn: [String],
    review: [{ type: String }],
    rating: { type: Number, min: 0, max: 5 },
    studentEnrollmentCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);
// Automatically calculate finalPrice before saving
courseSchema.pre("save", function (next) {
  if (this.isModified("price.amount") || this.isModified("price.discount")) {
    this.price.finalPrice = this.price.amount * (1 - this.price.discount / 100);
  }
  next();
});

// ===== Indexes for Performance ===== //
courseSchema.index({ category: 1, level: 1, language: 1 }); // For filtering courses by category, level, language
courseSchema.index({ studentEnrollmentCount: -1 }); // For sorting popular courses
courseSchema.index({ "price.finalPrice": 1 }); // For sorting by price
courseSchema.index({ rating: -1 }); // For sorting by rating
courseSchema.index({ createdAt: -1 }); // For recent courses

export default mongoose.model("Course", courseSchema);
