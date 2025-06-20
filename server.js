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


import ExamQuestion from './src/Routes/Exan-Question-Routes.js/Exam-Question-Routes.js';

const app = express();
const PORT =  process.env.PORT || 8000;

// Middleware 
app.use(cors());
app.use(express.json());
app.use(verifyToken);
dotenv.config();

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));



//User Routes
app.use("/", userRoutes);
app.use("/", userProfileRoutes);
app.use('/', courses);
app.use('/', Payment);

app.use("/",ExamQuestion)


// Start the server
app.listen(PORT, async () => {
    await connectDB();
    console.log(`Server is running on http://localhost:${PORT}`);
});
