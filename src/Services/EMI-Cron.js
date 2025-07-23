// Services/emiCron.js - Background Jobs
import cron from 'node-cron';
import { processOverdueEmis, sendPaymentReminders } from "./EMI-Service.js";

// Run daily at 00:00
// cron.schedule('0 0 * * *', async () => {
//   console.log("Scheuler is Running....")
//   await processOverdueEmis();
//   await sendPaymentReminders();
// });


cron.schedule('0 0 * * *', async () => {
  try {
    console.log("Starting EMI cron jobs...");
    await Promise.all([processOverdueEmis(), sendPaymentReminders()]);
    console.log("EMI cron jobs completed.");
  } catch (error) {
    console.error("EMI cron job error:", error);
  }
});