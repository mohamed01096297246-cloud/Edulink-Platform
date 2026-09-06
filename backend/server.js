require("dotenv").config(); // 1. تأكد إنها في أول سطر لتحميل المتغيرات البيئية
const mongoose = require("mongoose");
const app = require("./app");
const connectDB = require("./src/config/db");
const { startAttendanceReminders } = require("./src/jobs/attendanceReminder");

// دالة لبدء السيرفر بشكل منظم
const startServer = async () => {
  try {
    // 2. انتظر الاتصال بالداتا بيز أولاً قبل تشغيل السيرفر
    await connectDB();
    console.log("📂 Database connection established...");

    const PORT = process.env.PORT || 5000;

    const server = app.listen(PORT, () => {
      console.log(`🚀 Server is flying on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });

    // Warns a teacher whose lesson just ended that the register is still
    // empty. Safe to run in every instance — the send is claimed through a
    // unique index, so only one instance actually notifies.
    const stopReminders = startAttendanceReminders();

    // 3. معالجة الأخطاء غير المتوقعة (للأمان الشديد)
    process.on("unhandledRejection", (err) => {
      console.log(`❌ Error: ${err.message}`);
      // إغلاق السيرفر بشكل نظيف في حالة وقوع خطأ كارثي
      server.close(() => process.exit(1));
    });

    // 4. إغلاق نظيف عند إيقاف/استبدال السيرفر أثناء عملية نشر تحديث جديد —
    // بيتأكد إن أي طلب شغال فعليًا (مثلاً معلم بيسجّل حضور) يخلص الأول قبل
    // ما نقفل الاتصال بالسيرفر وقاعدة البيانات، بدل ما يتقطع في نصه.
    const shutdown = (signal) => {
      console.log(`\n${signal} received — shutting down gracefully...`);
      stopReminders();
      server.close(async () => {
        console.log("HTTP server closed (in-flight requests finished).");
        await mongoose.connection.close();
        console.log("MongoDB connection closed.");
        process.exit(0);
      });

      // شبكة أمان: لو فيه طلب عالق مش بيخلص، متستناش للأبد.
      setTimeout(() => {
        console.error("Forced shutdown after timeout.");
        process.exit(1);
      }, 15000).unref();
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

  } catch (error) {
    console.error("💥 Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();