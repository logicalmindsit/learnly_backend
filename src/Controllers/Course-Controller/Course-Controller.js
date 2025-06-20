import Course from "../../Models/Course-Model/Course-model.js";
import Payment from "../../Models/Payment-Model/Payment-Model.js"
import ExamQuestion from "../../Models/Exam-Model/Exam-Question-Model.js"

// Helper function to check if user has paid for a course
const checkPaymentStatus = async (userId, courseId) => {
  const payment = await Payment.findOne({
    userId,
    courseId,
    paymentStatus: 'completed'
  });
  return !!payment;
};

export const getCoursesForUserView = async (req, res) => {
  try {
    // Only select fields needed for card/grid display
    const courses = await Course.find({}, {
      coursename: 1,
      category: 1,
      courseduration: 1,
      thumbnail: 1,
      "price.amount": 1,
      "price.finalPrice": 1,
      rating: 1,
      level: 1,
      language: 1,
      studentEnrollmentCount: 1,
      instructor: 1,
      _id: 1, // for detail route
      createdAt: 1,
    }).sort({ createdAt: -1 }); // latest first if needed

    return res.status(200).json({
      success: true,
      message: "Courses fetched successfully for user view",
      data: courses,
    });
  } catch (error) {
    console.error("Error fetching user-view courses:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

//GET API to fetch a single course by ID with payment check
export const getCourseDetailWithPaymentCheck = async (req, res) => {
  try {
    const userId = req.userId
    const courseId = req.params.id;

    // Get course details
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ 
        success: false,  
        message: "Course not found" 
      });
    }

    // Check payment status
    const hasPaid = await checkPaymentStatus(userId, courseId);

    // Return different data based on payment status
    if (hasPaid) {
      return res.status(200).json({ 
        success: true,
        data: course,
        access: 'full' 
      });
    } else {
      // Return basic details for non-paying users
      const basicDetails = {
        _id: course._id,
        coursename: course.coursename,
        category: course.category,
        courseduration: course.courseduration,
        thumbnail: course.thumbnail,
        price: course.price,
        rating: course.rating,
        level: course.level,
        language: course.language,
        studentEnrollmentCount: course.studentEnrollmentCount,
        instructor: course.instructor,
        description: course.description,
        whatYoullLearn: course.whatYoullLearn
      };
      return res.status(200).json({ 
        success: true,
        data: basicDetails,
        access: 'limited' 
      });
    }
  } catch (error) {
    console.error("Error fetching course details:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};


export const getCourseContent = async (req, res) => {
  try {
    const userId = req.userId;
    const courseId = req.params.id;

    // Check payment status
    const hasPaid = await checkPaymentStatus(userId, courseId);
    if (!hasPaid) {
      return res.status(403).json({ 
        success: false,  
        message: "Payment required to access course content" 
      });
    }

    // Get course content and name
    const course = await Course.findById(courseId, { 
      chapters: 1,
      coursename: 1
    });

    if (!course) {
      return res.status(404).json({ 
        success: false,  
        message: "Course not found" 
      });
    }

    const chapterTitles = course.chapters.map(ch => ch.title);
    const exams = await ExamQuestion.find({
      coursename: course.coursename,
      chapterTitle: { $in: chapterTitles }
    });

    // Map exams by chapterTitle with full question details
    const examMap = {};
    exams.forEach(exam => {
      examMap[exam.chapterTitle] = {
        examId: exam._id,
        examinationName: exam.examinationName,
        subject: exam.subject,
        totalMarks: exam.totalMarks,
        examQuestions: exam.examQuestions.map(q => ({
          question: q.question,
          options: q.options,
          marks: q.marks,
          // Note: Correct answer might be sensitive - consider if you want to expose this
          correctAnswer: q.correctAnswer
        }))
      };
    });

    // Add exam data and count stats
    let chaptersWithExamsCount = 0;
    const chaptersWithExams = course.chapters.map(chapter => {
      const hasExam = !!examMap[chapter.title];
      if (hasExam) chaptersWithExamsCount++;
      
      return {
        ...chapter.toObject(),
        exam: hasExam ? examMap[chapter.title] : null
      };
    });

    // Create metadata
    const meta = {
      totalChapters: course.chapters.length,
      chaptersWithExams: chaptersWithExamsCount,
      chaptersWithoutExams: course.chapters.length - chaptersWithExamsCount
    };

    return res.status(200).json({ 
      success: true,
      data: chaptersWithExams,
      meta
    });
  } catch (error) {
    console.error("Error fetching course content:", error);
    return res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
};



