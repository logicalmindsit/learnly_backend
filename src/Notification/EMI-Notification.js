// notification/EMI-Notification.js
import User from "../Models/User-Model/User-Model.js";
import Twilio from "twilio";
import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
const client = new Twilio(accountSid, authToken);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_ADMIN,
    pass: process.env.EMAIL_PASS,
  },
});


const normalizePhoneNumber = (mobile) => {
  let cleaned = mobile.replace(/[^+\d]/g, "");
  if (cleaned.startsWith("+91") && cleaned.length === 13) {
    return cleaned;
  }

  if (!cleaned.startsWith("+91") && cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  console.warn(`Invalid phone number format: ${mobile}`);
  return null;
};

export const sendNotification = async (userId, type, data) => {
  const user = await User.findById(userId);
  if (!user) {
    console.error(`User not found: ${userId}`);
    return;
  }

  const emailTemplates = {
    welcome: (user, data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; background-color: #F5F5F5; color: #2D2F31; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background-color: #2D2F31; color: #FFFFFF; text-align: center; padding: 20px; }
          .content { padding: 20px; }
          .footer { text-align: center; padding: 10px; font-size: 12px; color: #666666; background-color: #F5F5F5; }
          .button { background-color: #A435F0; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
          .button:hover { background-color: #8B2CD6; }
          .highlight { color: #A435F0; font-weight: bold; }
          .disclaimer { color: #FF5722; font-size: 14px; }
          ul { list-style: none; padding: 0; }
          @media (max-width: 600px) {
            .container { margin: 10px; }
            .content { padding: 15px; }
            .button { padding: 10px 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Your Learning Journey!</h1>
          </div>
          <div class="content">
            <h2 style="color: #2D2F31;">Hello, ${user.username}!</h2>
            <p>You’ve successfully enrolled in <span class="highlight">${
              data.courseName
            }</span>.</p>
            <h3 style="color: #2D2F31;">Course Details</h3>
            <ul style="color: #2D2F31;">
              <li><strong>Name:</strong> ${data.courseName}</li>
              <li><strong>Duration:</strong> ${data.courseDuration}</li>
              <li><strong>Total Amount:</strong> ₹${
                data.isEmi ? data.totalAmount : data.amountPaid
              }</li>
            </ul>
            ${
              data.isEmi
                ? `
            <h3 style="color: #2D2F31;">EMI Details</h3>
            <ul style="color: #2D2F31;">
              <li><strong>First EMI Paid:</strong> ₹${data.amountPaid}</li>
              <li><strong>Total EMIs:</strong> ${data.emiTotalMonths}</li>
              <li><strong>Monthly EMI Amount:</strong> ₹${data.emiMonthlyAmount}</li>
              <li><strong>Next Due Date:</strong> ${data.nextDueDate}</li>
            </ul>`
                : ""
            }
            <p class="disclaimer"><strong>Disclaimer:</strong> ${
              data.noRefundPolicy
            }</p>
            <p>Start learning today and unlock your potential!</p>
            <a href="${data.courseUrl}" class="button">Go to Course</a>
          </div>
          <div class="footer">
            <p>Contact us at <a href="mailto:support@example.com" style="color: #666666;">support@example.com</a> | <a href="#" style="color: #666666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    reminder: (user, data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; background-color: #F5F5F5; color: #2D2F31; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background-color: #2D2F31; color: #FFFFFF; text-align: center; padding: 20px; }
          .content { padding: 20px; }
          .footer { text-align: center; padding: 10px; font-size: 12px; color: #666666; background-color: #F5F5F5; }
          .button { background-color: #A435F0; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
          .button:hover { background-color: #8B2CD6; }
          .warning { color: #FF5722; font-weight: bold; }
          ul { list-style: none; padding: 0; }
          @media (max-width: 600px) {
            .container { margin: 10px; }
            .content { padding: 15px; }
            .button { padding: 10px 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Reminder</h1>
          </div>
          <div class="content">
            <h2 style="color: #2D2F31;">Hi ${user.username},</h2>
            <p>Your next EMI payment for <strong>${
              data.courseName
            }</strong> is due soon.</p>
            <h3 style="color: #2D2F31;">Payment Details</h3>
            <ul style="color: #2D2F31;">
              <li><strong>Course:</strong> ${data.courseName}</li>
              <li><strong>Amount:</strong> ₹${data.amount}</li>
              <li><strong>Due Date:</strong> ${data.dueDate.toDateString()}</li>
            </ul>
            <p class="warning">Pay on time to keep your course access uninterrupted.</p>
            <a href="${data.paymentUrl}" class="button">Pay Now</a>
          </div>
          <div class="footer">
            <p>Contact us at <a href="mailto:support@example.com" style="color: #666666;">support@example.com</a> | <a href="#" style="color: #666666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    late: (user, data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; background-color: #F5F5F5; color: #2D2F31; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background-color: #FF5722; color: #FFFFFF; text-align: center; padding: 20px; }
          .content { padding: 20px; }
          .footer { text-align: center; padding: 10px; font-size: 12px; color: #666666; background-color: #F5F5F5; }
          .button { background-color: #A435F0; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
          .button:hover { background-color: #8B2CD6; }
          .warning { color: #FF5722; font-weight: bold; }
          ul { list-style: none; padding: 0; }
          @media (max-width: 600px) {
            .container { margin: 10px; }
            .content { padding: 15px; }
            .button { padding: 10px 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Overdue Payment Alert</h1>
          </div>
          <div class="content">
            <h2 style="color: #2D2F31;">Hi ${user.username},</h2>
            <p>Your EMI payment for <strong>${
              data.courseName
            }</strong> is overdue.</p>
            <h3 style="color: #2D2F31;">Overdue Details</h3>
            <ul style="color: #2D2F31;">
              <li><strong>Course:</strong> ${data.courseName}</li>
              <li><strong>Amount:</strong> ₹${data.amount}</li>
              <li><strong>Due Date:</strong> ${data.dueDate.toDateString()}</li>
              <li><strong>Grace Period Ends:</strong> ${data.gracePeriodEnd.toDateString()}</li>
            </ul>
            <p class="warning">Pay immediately to avoid course access being locked!</p>
            <a href="${data.paymentUrl}" class="button">Pay Now</a>
          </div>
          <div class="footer">
            <p>Contact us at <a href="mailto:support@example.com" style="color: #666666;">support@example.com</a> | <a href="#" style="color: #666666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    lock: (user, data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; background-color: #F5F5F5; color: #2D2F31; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #FFFFFF; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background-color: #FF5722; color: #FFFFFF; text-align: center; padding: 20px; }
          .content { padding: 20px; }
          .footer { text-align: center; padding: 10px; font-size: 12px; color: #666666; background-color: #F5F5F5; }
          .button { background-color: #A435F0; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
          .button:hover { background-color: #8B2CD6; }
          ul { list-style: none; padding: 0; }
          @media (max-width: 600px) {
            .container { margin: 10px; }
            .content { padding: 15px; }
            .button { padding: 10px 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Course Access Locked</h1>
          </div>
          <div class="content">
            <h2 style="color: #2D2F31;">Hi ${user.username},</h2>
            <p>Your access to <strong>${data.courseName}</strong> has been locked due to overdue EMI payments.</p>
            <p><strong>Reason:</strong> Unpaid EMIs</p>
            <p>To unlock your course, please clear all outstanding dues.</p>
            <h3 style="color: #2D2F31;">Next Steps</h3>
            <ul style="color: #2D2F31;">
              <li>Pay all overdue EMIs</li>
              <li>Contact support if you need help</li>
            </ul>
            <a href="${data.paymentUrl}" class="button">Pay Overdue EMIs</a>
          </div>
          <div class="footer">
            <p>Contact us at <a href="mailto:support@example.com" style="color: #666666;">support@example.com</a> | <a href="#" style="color: #666666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
    unlock: (user, data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; background-color: #F5F5F5; color: #2D2F31; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #WHITE; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background-color: #17AA5E; color: #FFFFFF; text-align: center; padding: 20px; }
          .content { padding: 20px; }
          .footer { text-align: center; padding: 10px; font-size: 12px; color: #666666; background-color: #F5F5F5; }
          .button { background-color: #A435F0; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; }
          .button:hover { background-color: #8B2CD6; }
          ul { list-style: none; padding: 0; }
          @media (max-width: 600px) {
            .container { margin: 10px; }
            .content { padding: 15px; }
            .button { padding: 10px 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Course Access Restored</h1>
          </div>
          <div class="content">
            <h2 style="color: #2D2F31;">Hi ${user.username},</h2>
            <p>Great news! Your access to <strong>${
              data.courseName
            }</strong> has been restored.</p>
            <p>Thank you for clearing your overdue EMI payments.</p>
            <p><strong>Next EMI Due:</strong> ${data.nextDueDate.toDateString()}</p>
            <p>Keep learning and stay on track with your payments!</p>
            <a href="${data.courseUrl}" class="button">Go to Course</a>
          </div>
          <div class="footer">
            <p>Contact us at <a href="mailto:support@example.com" style="color: #666666;">support@example.com</a> | <a href="#" style="color: #666666;">Unsubscribe</a></p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  const smsTemplates = {
    welcome: (user, data) =>
      data.isEmi
        ? `Welcome to ${data.courseName}, ${user.username}! EMI enrolled. Duration: ${data.courseDuration}, First EMI: ₹${data.amountPaid}, Total EMIs: ${data.emiTotalMonths}, Monthly: ₹${data.emiMonthlyAmount}, Next Due: ${data.nextDueDate}. ${data.noRefundPolicy} Start: ${data.courseUrl}`
        : `Welcome to ${data.courseName}, ${user.username}! Enrolled. Duration: ${data.courseDuration}, Paid: ₹${data.amountPaid}. ${data.noRefundPolicy} Start: ${data.courseUrl}`,
    reminder: (user, data) =>
      `Reminder: EMI of ₹${data.amount} for ${
        data.courseName
      } due on ${data.dueDate.toDateString()}. Pay now: ${data.paymentUrl}`,
    late: (user, data) =>
      `Alert: EMI of ₹${data.amount} for ${
        data.courseName
      } overdue since ${data.dueDate.toDateString()}. Pay now to avoid lock: ${
        data.paymentUrl
      }`,
    lock: (user, data) =>
      `${data.courseName} access locked due to overdue EMIs. Pay all dues to unlock: ${data.paymentUrl}. Contact support@example.com`,
    unlock: (user, data) =>
      `${data.courseName} access restored, ${
        user.username
      }! Next EMI due ${data.nextDueDate.toDateString()}. Continue learning: ${
        data.courseUrl
      }`,
  };

  const whatsappTemplates = {
    welcome: (user, data) =>
      data.isEmi
        ? `🌟 *Welcome to ${data.courseName}, ${user.username}!* 🌟\nEnrolled with EMI!\n- *Duration*: ${data.courseDuration}\n- *First EMI*: ₹${data.amountPaid}\n- *Total EMIs*: ${data.emiTotalMonths}\n- *Monthly EMI*: ₹${data.emiMonthlyAmount}\n- *Next Due*: ${data.nextDueDate}\n⚠️ *${data.noRefundPolicy}*\nStart learning: ${data.courseUrl}\nHappy learning! 🚀`
        : `🌟 *Welcome to ${data.courseName}, ${user.username}!* 🌟\nEnrolled!\n- *Duration*: ${data.courseDuration}\n- *Paid*: ₹${data.amountPaid}\n⚠️ *${data.noRefundPolicy}*\nStart learning: ${data.courseUrl}\nHappy learning! 🚀`,
    reminder: (user, data) =>
      `⏰ *EMI Reminder for ${data.courseName}* ⏰\nHi ${
        user.username
      },\n- *Amount*: ₹${
        data.amount
      }\n- *Due*: ${data.dueDate.toDateString()}\nPay now to keep learning: ${
        data.paymentUrl
      }\nDon’t delay! 🚨`,
    late: (user, data) =>
      `🚨 *Overdue EMI Alert for ${data.courseName}* 🚨\nHi ${
        user.username
      },\n- *Amount*: ₹${
        data.amount
      }\n- *Due*: ${data.dueDate.toDateString()}\n- *Grace Period Ends*: ${data.gracePeriodEnd.toDateString()}\nPay now to avoid lock: ${
        data.paymentUrl
      }\nAct fast! ⏳`,
    lock: (user, data) =>
      `🔒 *${data.courseName} Access Locked* 🔒\nHi ${user.username},\nYour course is locked due to unpaid EMIs.\n*Action*: Pay all dues to unlock: ${data.paymentUrl}\nNeed help? Email support@example.com`,
    unlock: (user, data) =>
      `✅ *${data.courseName} Access Restored* ✅\nHi ${
        user.username
      },\nYour course is back!\n- *Next EMI Due*: ${data.nextDueDate.toDateString()}\nKeep learning: ${
        data.courseUrl
      }\nHappy studying! 🎉`,
  };

  const template = emailTemplates[type];
  const smsTemplate = smsTemplates[type];
  const whatsappTemplate = whatsappTemplates[type];

  if (!template || !smsTemplate || !whatsappTemplate) {
    console.error(`Invalid notification type: ${type}`);
    return;
  }

  // Send notifications based on available contact details
  if (user.email) {
    try {
      await transporter.sendMail({
        from: `"Your Platform" <${process.env.EMAIL_ADMIN}>`,
        to: user.email,
        subject:
          type === "welcome"
            ? `Welcome to ${data.courseName}!`
            : type === "reminder"
            ? `Upcoming EMI Payment for ${data.courseName}`
            : type === "late"
            ? `Overdue EMI Payment for ${data.courseName}`
            : type === "lock"
            ? `Course Access Locked for ${data.courseName}`
            : `Course Access Restored for ${data.courseName}`,
        html: template(user, data),
      });
      console.log(`Email sent: ${type} to ${user.email}`);
    } catch (error) {
      console.error(`Failed to send email to ${user.email}:`, error);
    }
  }

  // Send SMS if mobile is available
  if (user.mobile) {
    const normalizedMobile = normalizePhoneNumber(user.mobile);
    if (normalizedMobile) {
      try {
        const smsResponse = await client.messages.create({
          body: smsTemplate(user, data),
          from: twilioPhone,
          to: normalizedMobile,
        });
        console.log(
          `SMS sent: ${type} to ${normalizedMobile}, SID: ${smsResponse.sid}, Status: ${smsResponse.status}`
        );
        console.log(`SMS sent: ${type} to ${user.mobile}`);
      } catch (error) {
        console.error(`Failed to send SMS to ${user.mobile}:`, error);
      }

      //  Send WhatsApp MSG if available
      if (user.whatsappOptIn) {
        try {
          const whatsappResponse = await client.messages.create({
            body: whatsappTemplate(user, data),
            from: `whatsapp:${
              process.env.TWILIO_WHATSAPP_NUMBER || twilioPhone
            }`,
            to: `whatsapp:${normalizedMobile}`,
          });
          console.log(
            `WhatsApp sent: ${type} to ${user.mobile}, SID: ${whatsappResponse.sid}, Status: ${whatsappResponse.status}`
          );
        } catch (error) {
          console.error(`Failed to send WhatsApp to ${user.mobile}:`, error);
        }
      } else {
        console.log(
          `Skipping WhatsApp for ${user.mobile}: User has not opted in`
        );
      }
    } else {
      console.error(
        `Skipping SMS/WhatsApp due to invalid phone number: ${user.mobile}`
      );
    }
  }

  console.log(`Notification sent: ${type} to user ${userId}`);
};
