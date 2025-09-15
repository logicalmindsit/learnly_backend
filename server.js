
import express from 'express';
import dotenv from "dotenv";
import connectDB from './src/DB/db.js';
import cors from 'cors';
import path from "path";
import userProfileRoutes from "./src/Routes/users-routes/user-profile-routes.js";

import { verifyToken } from "./src/Middleware/authMiddleware.js";
import courses from "./src/Routes/Course-routes/Course-routes.js";
import userRoutes from "./src/Routes/users-routes/User-Routes.js";
import Payment from "./src/Routes/Payment-Routes/Payment-Routes.js"
import Purchasedcourse from "./src/Routes/Purchased-routes/Purchased-routs.js"

import ExamQuestion from './src/Routes/Exan-Question-Routes.js/Exam-Question-Routes.js';
import './src/Services/EMI-Cron.js';

const app = express();
const PORT =  process.env.PORT || 8000;

// Middleware
dotenv.config(); // Move config to top
app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ======================= CHANGES START HERE =======================

// STEP 1: PUBLIC ROUTES (No token required)
// These routes are for login, registration, forgot password etc.
// They MUST come BEFORE the verifyToken middleware.
app.use("/", userRoutes);


// STEP 2: APPLY SECURITY MIDDLEWARE
// From this point onwards, all routes will require a valid token.
app.use(verifyToken);


// STEP 3: PROTECTED ROUTES (Token is required)
// These routes can only be accessed by logged-in users.
app.use("/", userProfileRoutes);
app.use('/', courses);
app.use('/', Payment);
app.use("/", ExamQuestion)
app.use('/', Purchasedcourse);

// ======================= CHANGES END HERE =======================

// Start the server
app.listen(PORT, async () => {
    await connectDB();
    console.log(`Server is running on http://localhost:${PORT}`);
});