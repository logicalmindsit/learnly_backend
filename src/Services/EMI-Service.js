// Services/emiService.js - EMI Management
import { sendNotification } from "../notification/EMI-Notification.js";
import EMIPlan from "../Models/Emi-Plan/Emi-Plan-Model.js";
import User from "../Models/User-Model/User-Model.js";

// Lock course access
export const lockCourseAccess = async (userId, courseId, emiPlanId) => {
  await User.updateOne(
    {
      _id: userId,
      "enrolledCourses.course": courseId,
    },
    {
      $set: {
        "enrolledCourses.$.accessStatus": "locked",
      },
    }
  );

  const plan = await EMIPlan.findById(emiPlanId);
  const overdueCount = plan.emis.filter(
    (emi) => emi.status === "pending" && emi.dueDate <= new Date()
  ).length;

  await EMIPlan.findByIdAndUpdate(emiPlanId, {
    $set: { status: "locked" },
    $push: {
      lockHistory: {
        lockDate: new Date(),
        overdueMonths: overdueCount,
      },
    },
  });

  sendNotification(userId, "lock", {
    courseId,
    courseName: plan.coursename,
  });
};

// Unlock course access
export const unlockCourseAccess = async (userId, courseId, emiPlanId) => {
  await User.updateOne(
    {
      _id: userId,
      "enrolledCourses.course": courseId,
    },
    {
      $set: {
        "enrolledCourses.$.accessStatus": "active",
      },
    }
  );

  const plan = await EMIPlan.findByIdAndUpdate(
    emiPlanId,
    {
      $set: {
        status: "active",
        "lockHistory.$[elem].unlockDate": new Date(),
      },
    },
    {
      arrayFilters: [{ "elem.unlockDate": { $exists: false } }],
      new: true,
    }
  );

  sendNotification(userId, "unlock", {
    courseId,
    courseName: plan.coursename,
  });
};

// Process overdue EMIs
export const processOverdueEmis = async () => {
  const today = new Date();
  const gracePeriodEnd = new Date(today);
  gracePeriodEnd.setDate(today.getDate() - 3);

  const overduePlans = await EMIPlan.find({
    status: "active",
    emis: {
      $elemMatch: {
        status: "pending",
        dueDate: { $lte: gracePeriodEnd },
      },
    },
  });

  for (const plan of overduePlans) {
    const overdueEmis = plan.emis.filter(
      (emi) => emi.status === "pending" && emi.dueDate <= gracePeriodEnd
    );

    await EMIPlan.updateOne(
      {
        _id: plan._id,
        "emis.status": "pending",
        "emis.dueDate": { $lte: gracePeriodEnd },
      },
      {
        $set: { "emis.$.status": "late", "emis.$.gracePeriodEnd": gracePeriodEnd },
      }
    );

    await lockCourseAccess(plan.userId, plan.courseId, plan._id);

    sendNotification(plan.userId, "late", {
      courseName: plan.coursename,
      dueDate: overdueEmis[0].dueDate,
    });
  }
};

// Send payment reminders
export const sendPaymentReminders = async () => {
  const today = new Date();
  const reminderDate = new Date(today);
  reminderDate.setDate(today.getDate() + 5);

  const upcomingEmis = await EMIPlan.aggregate([
    {
      $match: {
        status: "active",
        "emis.status": "pending",
      },
    },
    {
      $unwind: "$emis",
    },
    {
      $match: {
        "emis.status": "pending",
        "emis.dueDate": {
          $gte: today,
          $lte: reminderDate,
        },
      },
    },
  ]);

  for (const { emis, ...plan } of upcomingEmis) {
    sendNotification(plan.userId, "reminder", {
      courseName: plan.coursename,
      dueDate: emis.dueDate,
      amount: emis.amount,
    });
  }
};