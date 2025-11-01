// Services/emiService.js - EMI Management
import { sendNotification } from "../Notification/EMI-Notification.js";
import { calculateEmiStatus } from "./EMI-Utils.js";
import EMIPlan from "../Models/Emi-Plan/Emi-Plan-Model.js";
import User from "../Models/User-Model/User-Model.js";

// Lock course access
export const lockCourseAccess = async (userId, courseId, emiPlanId) => {
  console.log("[1] lockCourseAccess: Start", { userId, courseId, emiPlanId });
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
  console.log("[2] lockCourseAccess: User access locked");

  const plan = await EMIPlan.findById(emiPlanId);
  console.log("[3] lockCourseAccess: EMIPlan fetched", plan?._id);
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
  console.log(
    "[4] lockCourseAccess: EMIPlan status set to locked and lockHistory updated"
  );

  sendNotification(userId, "lock", {
    courseId,
    courseName: plan.coursename,
  });
  console.log("[5] lockCourseAccess: Notification sent");
};

// Unlock course access
export const unlockCourseAccess = async (userId, courseId, emiPlanId) => {
  console.log("[1] unlockCourseAccess: Start", { userId, courseId, emiPlanId });
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
  console.log("[2] unlockCourseAccess: User access unlocked");

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
  console.log(
    "[3] unlockCourseAccess: EMIPlan status set to active and unlockDate updated"
  );

  sendNotification(userId, "unlock", {
    courseId,
    courseName: plan.coursename,
  });
  console.log("[4] unlockCourseAccess: Notification sent");
};

// Process overdue EMIs
export const processOverdueEmis = async () => {
  console.log("[1] processOverdueEmis: Start");
  const today = new Date();
  console.log("[2] processOverdueEmis: Current date", today);

  // Find all active EMI plans to check their status
  const activePlans = await EMIPlan.find({
    status: { $in: ["active", "locked"] },
  });

  console.log("[3] processOverdueEmis: activePlans found", activePlans.length);

  for (const plan of activePlans) {
    try {
      const emiStatus = calculateEmiStatus(plan);
      let planNeedsUpdate = false;
      let userAccessNeedsUpdate = false;

      // Check if EMIs need status updates (pending -> late)
      const pendingEmisToMarkLate = plan.emis.filter(
        (emi) => emi.status === "pending" && emi.gracePeriodEnd < today
      );

      if (pendingEmisToMarkLate.length > 0) {
        console.log(
          `[4] processOverdueEmis: Found ${pendingEmisToMarkLate.length} EMIs to mark as late for plan ${plan._id}`
        );

        // Update EMI status to "late"
        await EMIPlan.updateOne(
          { _id: plan._id },
          {
            $set: {
              "emis.$[elem].status": "late",
            },
          },
          {
            arrayFilters: [
              {
                "elem._id": {
                  $in: pendingEmisToMarkLate.map((emi) => emi._id),
                },
              },
            ],
          }
        );
        planNeedsUpdate = true;
      }

      // Check if plan needs to be locked due to overdue payments
      if (emiStatus.hasOverduePayments && plan.status === "active") {
        console.log(
          `[5] processOverdueEmis: Locking plan ${plan._id} due to overdue payments`
        );

        await EMIPlan.findByIdAndUpdate(plan._id, {
          $set: { status: "locked" },
          $push: {
            lockHistory: {
              lockDate: today,
              overdueMonths: emiStatus.overdueCount,
              reasonForLock: `Auto-locked: ${emiStatus.overdueCount} overdue EMI(s)`,
              lockedBy: "system",
            },
          },
        });

        // Update user course access
        await User.updateOne(
          {
            _id: plan.userId,
            "enrolledCourses.course": plan.courseId,
          },
          {
            $set: {
              "enrolledCourses.$.accessStatus": "locked",
            },
          }
        );

        userAccessNeedsUpdate = true;

        // Send notification
        sendNotification(plan.userId, "lock", {
          courseId: plan.courseId,
          courseName: plan.coursename,
          overdueCount: emiStatus.overdueCount,
          overdueAmount: emiStatus.totalOverdue,
        });
      }

      // Check if plan should be unlocked (if was locked but now payments are current)
      else if (!emiStatus.hasOverduePayments && plan.status === "locked") {
        console.log(
          `[6] processOverdueEmis: Unlocking plan ${plan._id} - payments are current`
        );

        await EMIPlan.findByIdAndUpdate(
          plan._id,
          {
            $set: {
              status: "active",
              "lockHistory.$[elem].unlockDate": today,
            },
          },
          {
            arrayFilters: [{ "elem.unlockDate": { $exists: false } }],
          }
        );

        // Update user course access
        await User.updateOne(
          {
            _id: plan.userId,
            "enrolledCourses.course": plan.courseId,
          },
          {
            $set: {
              "enrolledCourses.$.accessStatus": "active",
            },
          }
        );

        userAccessNeedsUpdate = true;

        // Send notification
        sendNotification(plan.userId, "unlock", {
          courseId: plan.courseId,
          courseName: plan.coursename,
        });
      }

      console.log(
        `[7] processOverdueEmis: Plan ${plan._id} processed - planUpdate: ${planNeedsUpdate}, accessUpdate: ${userAccessNeedsUpdate}`
      );
    } catch (error) {
      console.error(
        `[ERROR] processOverdueEmis: Failed to process plan ${plan._id}:`,
        error
      );
    }
  }

  console.log("[8] processOverdueEmis: Completed");
};

// Send payment reminders
export const sendPaymentReminders = async () => {
  console.log("[1] sendPaymentReminders: Start");
  const today = new Date();
  const reminderDate = new Date(today);
  reminderDate.setDate(today.getDate() + 5);
  console.log("[2] sendPaymentReminders: reminderDate", reminderDate);

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
  console.log(
    "[3] sendPaymentReminders: upcomingEmis found",
    upcomingEmis.length
  );

  for (const { emis, ...plan } of upcomingEmis) {
    sendNotification(plan.userId, "reminder", {
      courseName: plan.coursename,
      dueDate: emis.dueDate,
      amount: emis.amount,
    });
    console.log(
      "[4] sendPaymentReminders: Notification sent for user",
      plan.userId
    );
  }
};

// Fix EMI status inconsistencies for a specific user and course
export const fixEmiStatusForUser = async (userId, courseId) => {
  console.log("[1] fixEmiStatusForUser: Start", { userId, courseId });

  try {
    // Find the EMI plan
    const emiPlan = await EMIPlan.findOne({ userId, courseId });
    if (!emiPlan) {
      console.log("[2] fixEmiStatusForUser: No EMI plan found");
      return { success: false, message: "No EMI plan found" };
    }

    // Calculate current status
    const emiStatus = calculateEmiStatus(emiPlan);
    console.log("[3] fixEmiStatusForUser: EMI status calculated", {
      hasOverduePayments: emiStatus.hasOverduePayments,
      hasAccessToContent: emiStatus.hasAccessToContent,
      planStatus: emiPlan.status,
    });

    let planUpdated = false;
    let userUpdated = false;

    // Update EMI statuses if needed
    const today = new Date();
    const pendingEmisToMarkLate = emiPlan.emis.filter(
      (emi) => emi.status === "pending" && emi.gracePeriodEnd < today
    );

    if (pendingEmisToMarkLate.length > 0) {
      console.log(
        "[4] fixEmiStatusForUser: Marking EMIs as late",
        pendingEmisToMarkLate.length
      );
      await EMIPlan.updateOne(
        { _id: emiPlan._id },
        {
          $set: {
            "emis.$[elem].status": "late",
          },
        },
        {
          arrayFilters: [
            {
              "elem._id": { $in: pendingEmisToMarkLate.map((emi) => emi._id) },
            },
          ],
        }
      );
      planUpdated = true;
    }

    // Update plan status based on current EMI status
    const correctPlanStatus = emiStatus.hasAccessToContent
      ? "active"
      : "locked";
    if (emiPlan.status !== correctPlanStatus) {
      console.log(
        "[5] fixEmiStatusForUser: Updating plan status from",
        emiPlan.status,
        "to",
        correctPlanStatus
      );

      const updateData = { status: correctPlanStatus };

      // Add lock history if locking
      if (correctPlanStatus === "locked") {
        updateData.$push = {
          lockHistory: {
            lockDate: today,
            overdueMonths: emiStatus.overdueCount,
            reasonForLock: "Auto-fix: EMI status correction",
            lockedBy: "system",
          },
        };
      } else if (emiPlan.status === "locked") {
        // Update latest lock history with unlock date
        updateData.$set = {
          ...updateData,
          "lockHistory.$[elem].unlockDate": today,
        };
        updateData.$arrayFilters = [{ "elem.unlockDate": { $exists: false } }];
      }

      await EMIPlan.findByIdAndUpdate(emiPlan._id, updateData);
      planUpdated = true;
    }

    // Update user course access
    const user = await User.findOne(
      {
        _id: userId,
        "enrolledCourses.course": courseId,
      },
      { "enrolledCourses.$": 1 }
    );

    if (user && user.enrolledCourses[0]) {
      const correctAccessStatus = emiStatus.hasAccessToContent
        ? "active"
        : "locked";
      const currentAccessStatus = user.enrolledCourses[0].accessStatus;

      if (currentAccessStatus !== correctAccessStatus) {
        console.log(
          "[6] fixEmiStatusForUser: Updating user access from",
          currentAccessStatus,
          "to",
          correctAccessStatus
        );
        await User.updateOne(
          {
            _id: userId,
            "enrolledCourses.course": courseId,
          },
          {
            $set: {
              "enrolledCourses.$.accessStatus": correctAccessStatus,
            },
          }
        );
        userUpdated = true;
      }
    }

    console.log("[7] fixEmiStatusForUser: Completed", {
      planUpdated,
      userUpdated,
    });

    return {
      success: true,
      planUpdated,
      userUpdated,
      emiStatus: {
        ...emiStatus,
        planStatus: correctPlanStatus,
      },
    };
  } catch (error) {
    console.error("[ERROR] fixEmiStatusForUser:", error);
    return { success: false, error: error.message };
  }
};

// Bulk fix all EMI status inconsistencies
export const fixAllEmiStatusInconsistencies = async () => {
  console.log("[1] fixAllEmiStatusInconsistencies: Start");

  try {
    const allPlans = await EMIPlan.find({
      status: { $in: ["active", "locked"] },
    });

    console.log(
      "[2] fixAllEmiStatusInconsistencies: Found",
      allPlans.length,
      "plans to check"
    );

    let fixed = 0;
    let errors = 0;

    for (const plan of allPlans) {
      try {
        const result = await fixEmiStatusForUser(plan.userId, plan.courseId);
        if (result.success && (result.planUpdated || result.userUpdated)) {
          fixed++;
        }
      } catch (error) {
        console.error(`[ERROR] Failed to fix plan ${plan._id}:`, error);
        errors++;
      }
    }

    console.log("[3] fixAllEmiStatusInconsistencies: Completed", {
      fixed,
      errors,
      total: allPlans.length,
    });

    return { success: true, fixed, errors, total: allPlans.length };
  } catch (error) {
    console.error("[ERROR] fixAllEmiStatusInconsistencies:", error);
    return { success: false, error: error.message };
  }
};
