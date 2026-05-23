const User = require("../models/User");
const Subject = require("../models/Subject"); 
const Grade=require("../models/Grade");
const Schedule = require("../models/Schedule");
const Attendance = require("../models/Attendance");
const Homework = require("../models/Homework");
const { sendCredentialsEmail } = require("../utils/emailService");
const { generateUsername, generatePassword } = require("../utils/generateCredentials");

exports.createTeacher = async (req, res) => {
  try {
  
    const { firstName, lastName, phoneNumber, nationalId, email, subjectId, teachingGrades } = req.body;


    const existingSubject = await Subject.findById(subjectId);
    if (!existingSubject) {
      return res.status(400).json({ message: "المادة الدراسية المختارة غير موجودة في النظام" });
    }

    const username = generateUsername(`${firstName} ${lastName}`);
    const password = generatePassword(); 

const teacher = await User.create({
      firstName, lastName, phoneNumber, nationalId, email,
      role: "teacher",
      subject: subjectId, 
      teachingGrades, 
      username, password,
      active: true
    });

    if (email) await sendCredentialsEmail(email, username, password, "Teacher");
    
    res.status(201).json({ 
      message: "تم إنشاء حساب المعلم بنجاح", 
      teacher: {
        id: teacher._id,
        name: `${teacher.firstName} ${teacher.lastName}`,
        username: teacher.username,
        teachingGrades: teacher.teachingGrades
      }
    });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

exports.getAllTeachers = async (req, res) => {
  try {
const teachers = await User.find({ role: "teacher" })
      .populate("subject", "name code")
      .populate("teachingGrades", "name academicYear") 
      .select("firstName lastName phoneNumber teachingGrades subject");

    res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers
    });
  } catch (err) {
    res.status(500).json({ 
      success: false, 
      message: "حدث خطأ أثناء جلب البيانات: " + err.message 
    });
  }
};



exports.getTeacherDashboard = async (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ message: "هذه اللوحة مخصصة للمعلمين فقط" });
    }

    const teacherId = req.user.id;
    const days = ["sun", "mon", "tue", "wed", "thu"];
    const now = new Date();
    const day = days[now.getDay()];

    const todayClasses = await Schedule.find({
      teacher: teacherId,
      day
    })
    .populate({
      path: "classroom",
      select: "name grade",
      populate: { path: "grade", select: "name academicYear" }
    })
    .sort({ startTime: 1 }); 

    const currentTime = now.getHours() * 60 + now.getMinutes();
    const currentClassIndicator = todayClasses.find((cls) => {

      const [sh, sm] = cls.startTime.split(":").map(Number);
      const [eh, em] = cls.endTime.split(":").map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      return currentTime >= start && currentTime <= end;
    });

    // 3. جلب إحصائيات الغياب والواجبات
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const attendanceToday = await Attendance.find({
      recordedBy: teacherId,
      date: { $gte: startOfDay, $lte: endOfDay }
    }).populate("student", "firstName lastName");

    const absentStudents = attendanceToday
      .filter(a => a.status === "absent")
      .map(a => ({
        id: a.student._id,
        name: `${a.student.firstName} ${a.student.lastName}`, 
        date: a.date
      }));

    const homeworks = await Homework.find({ teacher: teacherId })
    .populate({
      path: "classroom",
      select: "name grade",
      populate: { path: "grade", select: "name academicYear" } 
    })
    .sort({ createdAt: -1 })
    .limit(5);

    // . هنا ببعتلك البيانات ياعمر 
    res.json({
      summary: {
        totalClassesToday: todayClasses.length,
        totalAbsentsRecorded: absentStudents.length,
        serverTime: new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'})
      },
      todayClasses,           
      currentClassIndicator,  
      absentStudents,
      recentHomeworks: homeworks
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateTeacher = async (req, res) => {
  try {
    const teacherId = req.params.id;
    const { firstName, lastName, phoneNumber, nationalId, email, subjectId, teachingGrades, active } = req.body;

    const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
    if (!teacher) {
      return res.status(404).json({ message: "عفواً، المعلم غير موجود" });
    }

    const updateData = { firstName, lastName, phoneNumber, nationalId, email };
    
    if (active !== undefined) updateData.active = active;

    if (subjectId) {
      const Subject = require("../models/Subject");
      const existingSubject = await Subject.findById(subjectId);
      if (!existingSubject) {
        return res.status(400).json({ message: "المادة الدراسية المختارة غير موجودة" });
      }
      updateData.subject = subjectId;
    }

    if (teachingGrades) {
      updateData.teachingGrades = teachingGrades;
    }

    const updatedTeacher = await User.findByIdAndUpdate(
      teacherId,
      updateData,
      { new: true, runValidators: true }
    )
    .populate("subject", "name code")
    .populate("teachingGrades", "name academicYear")
    .select("-password");

    res.status(200).json({
      success: true,
      message: "تم تحديث بيانات المعلم بنجاح",
      data: updatedTeacher
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteTeacher = async (req, res) => {
  try {
    const teacherId = req.params.id;

    const teacher = await User.findOne({ _id: teacherId, role: "teacher" });
    if (!teacher) {
      return res.status(404).json({ message: "عفواً، المعلم غير موجود" });
    }

    const Schedule = require("../models/Schedule");
    const schedulesCount = await Schedule.countDocuments({ teacher: teacherId });
    
    if (schedulesCount > 0) {
      return res.status(400).json({ 
        message: "لا يمكن حذف هذا المعلم لارتباطه بجدول حصص دراسية. يرجى حذف حصصه أولاً، أو القيام بإيقاف حسابه مؤقتاً (Deactivate) بدلاً من الحذف النهائي." 
      });
    }

    await teacher.deleteOne();

    res.status(200).json({
      success: true,
      message: "تم حذف حساب المعلم من النظام بنجاح"
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};