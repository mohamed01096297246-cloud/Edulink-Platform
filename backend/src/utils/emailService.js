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
// Handing over login credentials is the only thing EduLink emails about.
// Everything else a parent or teacher needs to hear reaches them as a push
// notification and as a row in the app's notifications list — the alert-mail
// helper that used to live here was removed on purpose, so that a future
// change has to make a deliberate decision instead of finding it lying about.
module.exports = {
  sendCredentialsEmail,
};

