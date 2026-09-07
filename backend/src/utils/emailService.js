const nodemailer = require("nodemailer");

// Names come from admin-entered form fields and land inside an HTML body,
// so they are escaped rather than trusted.
const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const sendCredentialsEmail = async (
  email,
  username,
  password,
  role,
  fullName,
) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const name = escapeHtml(fullName).trim();

    const mailOptions = {
      from: `"EduLink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your EduLink Account Credentials",
      html: `
        <h2>Welcome to EduLink</h2>
        ${
          // Older callers pass no name; the greeting is skipped rather than
          // addressing the reader as "undefined".
          name ? `<p><b>Name:</b> ${name}</p>` : ""
        }
        <p>Your account has been created successfully.</p>

        <p><b>Role:</b> ${escapeHtml(role)}</p>
        <p><b>Username:</b> ${escapeHtml(username)}</p>
        <p><b>Password:</b> ${escapeHtml(password)}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.log("Email Error:", error);
  }
};
const sendAlertEmail = async (email, subjectTitle, messageBody) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"EduLink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: subjectTitle,
      html: `
        <h3>تنبيه من إدارة المدرسة</h3>
        <p>${messageBody}</p>
      `,
    };

    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.log("Email Error:", error);
  }
};
module.exports = {
  sendCredentialsEmail,
  sendAlertEmail,
};

