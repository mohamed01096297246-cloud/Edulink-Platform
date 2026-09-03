const nodemailer = require("nodemailer");

const sendCredentialsEmail = async (email, username, password, role) => {
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
      subject: "Your EduLink Account Credentials",
      html: `
        <h2>Welcome to EduLink</h2>
        <p>Your account has been created successfully.</p>

        <p><b>Role:</b> ${role}</p>
        <p><b>Username:</b> ${username}</p>
        <p><b>Password:</b> ${password}</p>

        <p>Please change your password after login.</p>
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

