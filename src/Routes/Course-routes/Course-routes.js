import express from "express";
import { getCourseDetailWithPaymentCheck,getCoursesForUserView,getCourseContent} from "../../Controllers/Course-Controller/Course-Controller.js";

const router = express.Router();

router.get("/courses/user-view", getCoursesForUserView);   // For grid view
router.get("/courses/:id", getCourseDetailWithPaymentCheck); // For detail view with payment check
router.get("/courses/:id/content", getCourseContent);      // For actual content access            // For detail view
export default router;
