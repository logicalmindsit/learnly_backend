
//Routes/Payment-Routes/Payment-Routes.js
import express from "express";
import { createPayment ,verifyPayment,getEmiDetailsForCourse,getUserPayments,getUserPaymentById} from "../../Controllers/Payment-controller/Payment-Controller.js";

const router = express.Router();

// User Payment Dashbaord
router.post("/user/payment/create", createPayment);
router.post("/user/payment/verify", verifyPayment);
router.get("/user/payment/emi-details/:courseId", getEmiDetailsForCourse);


router.get("/user/payment",getUserPayments);
router.get("/user/payment/:id", getUserPaymentById);

export default router;

