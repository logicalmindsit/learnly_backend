// controllers/ExamAttemptController.js
import ExamQuestion from "../../Models/Exam-Model/Exam-Question-Model.js";
import ExamAttempt from "../../Models/Exam-Model/User-Submit-Model.js";
import Course from "../../Models/Course-Model/Course-model.js";
import mongoose from "mongoose";
import User from "../../Models/User-Model/User-Model.js"


export const submitExamAttempt = async (req, res) => {
  try {
    const userId = req.userId;
    const { examId, courseId, chapterTitle, answers } = req.body;

    // 1. Basic Validation
    if (!examId || !courseId || !chapterTitle || !Array.isArray(answers)) {
      return res.status(400).json({
        success: false,
        message: "Invalid request. Please provide examId, courseId, chapterTitle, and answers array."
      });
    }

    // 2. Check if Course Exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found. Please verify the courseId."
      });
    }

    // 3. Check if Exam Exists
    const exam = await ExamQuestion.findById(examId);
    if (!exam) {
      return res.status(404).json({
        success: false,
        message: "Exam not found. Please verify the examId."
      });
    }

    // 4. Check if Chapter Title Matches
    if (exam.chapterTitle !== chapterTitle) {
      return res.status(400).json({
        success: false,
        message: `Chapter mismatch. Exam belongs to chapter "${exam.chapterTitle}", but got "${chapterTitle}".`
      });
    }

    // 5. Check if Exam Already Attempted (optional)
    const existingAttempt = await ExamAttempt.findOne({
      userId,
      courseId,
      chapterTitle,
      examId
    });

    if (existingAttempt) {
      return res.status(409).json({
        success: false,
        message: "You have already submitted this exam. Re-attempt is not allowed."
      });
    }
const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }



      
    // 6. Process Answers
    let obtainedMarks = 0;
    const detailedAnswers = answers.map(userAnswer => {
      const originalQuestion = exam.examQuestions.find(q => q.question === userAnswer.question);
      if (!originalQuestion) return null;

      const isCorrect = originalQuestion.correctAnswer === userAnswer.selectedAnswer;
      const marksAwarded = isCorrect ? originalQuestion.marks : 0;

      if (isCorrect) obtainedMarks += marksAwarded;

      return {
        question: userAnswer.question,
        selectedAnswer: userAnswer.selectedAnswer,
        isCorrect,
        marksAwarded
      };
    }).filter(Boolean); // Remove any unanswered or invalid questions

    if (detailedAnswers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid answers submitted. Please ensure your answers match the questions provided in the exam."
      });
    }

    // 7. Save Exam Attempt
    const attempt = new ExamAttempt({
      userId,
      MotherId: user.CourseMotherId || null, // Ensure CourseMotherId is included 
      studentRegisterNumber: user.studentRegisterNumber || null,
      email: user.email || null,
      username: user.username || null,

      courseId,
      chapterTitle,
      examId,
      answers: detailedAnswers,
      totalMarks: exam.totalMarks,
      obtainedMarks
    });

    await attempt.save();

    // 8. Return Success Response
    return res.status(201).json({
      success: true,
      message: "Exam submitted successfully.",
      data: {
        totalMarks: exam.totalMarks,
        obtainedMarks,
        correctCount: detailedAnswers.filter(a => a.isCorrect).length,
        wrongCount: detailedAnswers.filter(a => !a.isCorrect).length
      }
    });

  } catch (error) {
    console.error("Error submitting exam attempt:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while submitting the exam. Please try again later.",
      error: error.message
    });
  }
};


export const getUserExamAttempts = async (req, res) => {
  try {
    const userId = req.userId; 
    const { courseId, examId, page = 1, limit = 10 } = req.query;

    if (courseId && !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid courseId."
      });
    }
    if (examId && !mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid examId."
      });
    }

   
    let query = { userId };
    if (courseId) query.courseId = courseId;
    if (examId) query.examId = examId;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const pageFinal = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum; 
    const limitFinal = isNaN(limitNum) || limitNum < 1 ? 10 : limitNum; 


    const skip = (pageFinal - 1) * limitFinal;


    const attempts = await ExamAttempt.find(query)
      .sort({ attemptedAt: -1 }) 
      .skip(skip)
      .limit(limitFinal) 
      .lean(); 


    const totalCount = await ExamAttempt.countDocuments(query);


    let message;
    if (totalCount === 0) {

      if (examId) {
        message = "You have not attempted this exam.";
      } else if (courseId) {
        message = "You have not attempted any exams for this course.";
      } else {
        message = "You have not attempted any exams yet.";
      }
    } else if (attempts.length === 0) {

      message = "No more exam attempts available for this page.";
    } else {
      message = "Exam attempts retrieved successfully.";
    }

    return res.status(200).json({
      success: true,
      message,
      data: attempts,
      pagination: {
        currentPage: pageFinal,
        totalPages: Math.ceil(totalCount / limitFinal),
        totalItems: totalCount,
        itemsPerPage: limitFinal
      }
    });
  } catch (error) {
    console.error("Error fetching exam attempts:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching exam attempts.",
      error: error.message
    });
  }
};