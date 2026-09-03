const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
require("dotenv").config();

const app = express();


app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Uploaded homework photos (see src/middleware/upload.js) — served with a
// relaxed CORP header since these are plain public images fetched by
// whichever client (mobile app, future web dashboard) needs to show them,
// not the app's authenticated JSON API.
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "uploads")),
);

if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}


const authRoutes = require("./src/routes/authRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const teacherRoutes = require("./src/routes/teacherRoutes");
const parentRoutes = require("./src/routes/parentRoutes");
const studentRoutes = require("./src/routes/studentRoutes");
const classroomRoutes = require("./src/routes/classroomRoutes"); 
const subjectRoutes = require("./src/routes/subjectRoutes");
const scheduleRoutes = require("./src/routes/scheduleRoutes");
const attendanceRoutes = require("./src/routes/attendanceRoutes");
const behaviorRoutes = require("./src/routes/behaviorRoutes");
const homeworkRoutes = require("./src/routes/homeworkRoutes");
const examRoutes = require("./src/routes/examRoutes");
const resultRoutes = require("./src/routes/resultRoutes");
const homeworkResultRoutes = require("./src/routes/homeworkResultRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");
const gradeRoutes = require("./src/routes/gradeRoutes");
const schoolRoutes = require("./src/routes/schoolRoutes");
const feeRoutes = require("./src/routes/feeRoutes");
const analyticsRoutes = require("./src/routes/analyticsRoutes");
const staffAttendanceRoutes = require("./src/routes/staffAttendanceRoutes");
const monthlyGradeRoutes = require("./src/routes/monthlyGradeRoutes");
const weeklyEvaluationRoutes = require("./src/routes/weeklyEvaluationRoutes");
const courseworkRoutes = require("./src/routes/courseworkRoutes");
const gradeRegisterRoutes = require("./src/routes/gradeRegisterRoutes");
const classworkNotebookRoutes = require("./src/routes/classworkNotebookRoutes");
const boardNoteRoutes = require("./src/routes/boardNoteRoutes");


app.use("/api/auth", authRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/parent", parentRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/classrooms", classroomRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/behavior", behaviorRoutes);
app.use("/api/homework", homeworkRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/results", resultRoutes);
app.use("/api/homework-results", homeworkResultRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/grades",gradeRoutes );
app.use("/api/fees", feeRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/staff-attendance", staffAttendanceRoutes);
app.use("/api/monthly-grades", monthlyGradeRoutes);
app.use("/api/weekly-evaluation", weeklyEvaluationRoutes);
app.use("/api/coursework", courseworkRoutes);
app.use("/api/grade-register", gradeRegisterRoutes);
app.use("/api/classwork-notebook", classworkNotebookRoutes);
app.use("/api/board-notes", boardNoteRoutes);



app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to EduLink API 🚀",
    status: "Server is healthy",
    version: "1.0.0"
  });
});

// Real readiness check for the hosting platform's rolling deploys — a
// health check that only inspects the Express process (like the "/" route
// above) would report healthy the instant Node boots, before it can
// actually serve a database-backed request. Reporting DB state here is
// what lets Render/Railway/etc. hold traffic on the old instance until the
// new one can genuinely handle a request, giving zero-downtime deploys.
app.get("/health", (req, res) => {
  const mongoose = require("mongoose");
  const dbReady = mongoose.connection.readyState === 1; // 1 = connected

  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? "ok" : "not_ready",
    db: dbReady ? "connected" : "disconnected",
  });
});


app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "عفواً، هذا المسار (Route) غير موجود"
  });
});


app.use((err, req, res, next) => {
  console.error("Critical Error:", err.stack);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
});

module.exports = app;
