import mongoose from "mongoose";

const QuestionItemSchema = new mongoose.Schema({
  question: { type: String, required: true, index: true },
  options: { type: [String], required: true },
  correctAnswer: { type: String, required: true },
  marks: { type: Number, required: true },
});

const ExamSchema = new mongoose.Schema(
  {
    coursename: { type: String, required: true, index: true },        
    chapterTitle: { type: String, required: true, index: true },     
    examinationName: { type: String, required: true, index: true },
    subject: { type: String, required: true, index: true },
    totalMarks: { type: Number, required: true },
    examQuestions: [QuestionItemSchema],
    uploadDate: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

const ExamQuestion = mongoose.model("ExamQuestion", ExamSchema);
export default ExamQuestion;