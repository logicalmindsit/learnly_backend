
// server.js
import express from 'express';
import dotenv from "dotenv";
import connectDB from './src/DB/db.js';
import cors from 'cors';
import path from "path";
import userProfileRoutes from "./src/Routes/users-routes/user-profile-routes.js";
import { verifyToken } from "./src/Middleware/authMiddleware.js";
import courses from "./src/Routes/Course-routes/Course-routes.js";
import userRoutes from "./src/Routes/users-routes/User-Routes.js";
import Payment from "./src/Routes/Payment-Routes/Payment-Routes.js";
import Purchasedcourse from "./src/Routes/Purchased-routes/Purchased-routs.js";
import ExamQuestion from './src/Routes/Exan-Question-Routes.js/Exam-Question-Routes.js';

// ✅ FINAL CORRECTED PATH
import notificationRoutes from './src/Routes/NotificationBell/NotificationRoutes.js'; 
import joinRequestRoutes from './src/Routes/NotificationBell/joinRequestRoutes.js';
import materialRoutes from './src/Routes/NotificationBell/materialRoutes.js';
import announcementRoutes from './src/Routes/Announcement-Routes/AnnouncementRoutes.js';
//cron job import
import cron from "node-cron";
import {
  processOverdueEmis,
  sendPaymentReminders,
} from "./src/Services/EMI-Service.js";

const app = express();
const PORT =  process.env.PORT || 8000;

// Middleware
dotenv.config();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ======================= HEALTH CHECK ROUTE =======================

app.get("/health", async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const isDbConnected = dbState === 1;

    if (!isDbConnected) {
      return res.status(503).json({
        status: "error",
        service: "NodeJS API",
        message: "Database connection is down.",
        dbState: mongoose.STATES[dbState],
      });
    }

    res.status(200).json({
      status: "ok",
      service: "NodeJS API",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
      dependencies: {
        database: "connected",
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "Health check failed.",
      error: error.message,
    });
  }
});

// ======================= CHANGES START HERE =======================

// STEP 1: WEBHOOK ROUTES (No auth required - must come first)
// Webhook routes need raw body parsing and no authentication
app.use("/webhook", express.raw({ type: "application/json" }), Payment);


// --- PUBLIC ROUTES ---
app.use("/", userRoutes);
app.use('/api/announcements', announcementRoutes); // Public announcement routes

// --- SECURITY CHECKPOINT ---
app.use(verifyToken);

// --- PROTECTED ROUTES ---
app.use("/", userProfileRoutes);
app.use('/', courses);
app.use('/', Payment);
app.use("/", ExamQuestion);
app.use('/', Purchasedcourse);
app.use('/api/bell-notifications', notificationRoutes);
app.use('/api/join-requests', joinRequestRoutes);
app.use('/api/my-materials', materialRoutes);


// ======================= CHANGES END HERE =======================

// ======================= CRON JOBS -EMI=======================
// Schedule tasks to be run on the server
let isRunning = false;
cron.schedule("0 10 * * *",async () => { // run daily At 10:00 AM every day
    if (isRunning) {
      console.log("⚠️ EMI cron job already running, skipping this execution");
      return;
    }

    isRunning = true;
    try {
      const nowLocal = new Date().toLocaleString(); // server local time
      console.log(`⏰ Running EMI tasks at Local Time: ${nowLocal}`);

      console.log("⏰ Running scheduled EMI cron tasks...");
      await processOverdueEmis();
      await sendPaymentReminders();
      console.log("✅ EMI cron tasks completed successfully.");
    } catch (error) {
      console.error("❌ An error occurred during a scheduled EMI task:", error);
    } finally {
      isRunning = false;
      console.log("🛑 EMI cron job finished");
    }
  },
  {
    // timezone: "UTC",
    timezone: "Asia/Kolkata",
  }
);

// Start the server
app.listen(PORT, async () => {
    await connectDB();
    console.log(`Server is running on http://localhost:${PORT}`);
});