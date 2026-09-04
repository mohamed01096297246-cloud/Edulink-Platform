const Notification = require("../models/Notification");
const User = require("../models/User");
const Student = require("../models/Student");
const Schedule = require("../models/Schedule");
const { sendCredentialsEmail } = require("../utils/emailService");
const { sendPushNotifications } = require("../utils/pushNotifications");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

// A teacher only ever notifies parents of students they actually teach —
// never the whole school. Same source of truth as every other per-teacher
// screen (Schedule → classroom → student), collapsed to the unique set of
// parents, each carrying the names of the teacher's own students under them
// (a parent can have more than one child in the same class/teacher).
const getTeacherParents = async (teacherId) => {
  const schedules = await Schedule.find({ teacher: teacherId }).select(
    "classroom",
  );
  const classroomIds = [
    ...new Set(schedules.map((s) => s.classroom.toString())),
  ];

  const students = await Student.find({
    classroom: { $in: classroomIds },
    active: true,
  })
    .select("firstName lastName parent")
    .populate("parent", "firstName lastName email pushToken");

  const parentsMap = new Map();
  students.forEach((student) => {
    if (!student.parent) return;

    const key = student.parent._id.toString();
    if (!parentsMap.has(key)) {
      parentsMap.set(key, { parent: student.parent, children: [] });
    }
    parentsMap
      .get(key)
      .children.push(`${student.firstName} ${student.lastName}`);
  });

  return parentsMap;
};

exports.getTeacherParentsList = async (req, res) => {
  try {
    const parentsMap = await getTeacherParents(req.user.id);

    const data = Array.from(parentsMap.values()).map(({ parent, children }) => ({
      _id: parent._id,
      firstName: parent.firstName,
      lastName: parent.lastName,
      children,
    }));

    res.status(200).json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createNotification = async (req, res) => {
  try {
    const { title, message, target, parentId } = req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "من فضلك حدد مدرسة (?school=id) لإرسال الإشعار.",
      });
    }

    if (target === "parent" && !parentId) {
      return res.status(400).json({
        message: "اختيار ولي الأمر مطلوب.",
      });
    }

    // A teacher's notification is scoped to their own students' parents —
    // both the recipient list for "all" and the allowed choices for
    // "parent" come from the exact same set, so a teacher can never reach a
    // parent outside their own classes.
    let recipients = null;
    if (req.user.role === "teacher") {
      const parentsMap = await getTeacherParents(req.user.id);

      if (target === "parent") {
        if (!parentsMap.has(parentId)) {
          return res.status(403).json({
            message: "غير مصرح لك بإرسال إشعار لولي أمر هذا ليس من طلابك.",
          });
        }
        recipients = [parentsMap.get(parentId).parent];
      } else {
        recipients = Array.from(parentsMap.values()).map((v) => v.parent);
      }
    }

    const notification = await Notification.create({
      title,
      message,
      target: target || "all",
      parent: target === "parent" ? parentId : null,
      createdBy: req.user._id,
      school,
    });

    if (req.user.role === "teacher") {
      for (let p of recipients) {
        if (p.email) {
          await sendCredentialsEmail(p.email, title, message);
        }
      }
      await sendPushNotifications(
        recipients.map((p) => p.pushToken),
        title,
        message,
        { type: "notification", notificationId: notification._id },
      );
    } else if (target === "all" || !target) {
      const parents = await User.find({ role: "parent", school });

      for (let p of parents) {
        if (p.email) {
          await sendCredentialsEmail(p.email, title, message);
        }
      }
      await sendPushNotifications(
        parents.map((p) => p.pushToken),
        title,
        message,
        { type: "notification", notificationId: notification._id },
      );
    } else if (target === "parent") {
      const parentUser = await User.findById(parentId);

      if (parentUser && parentUser.email) {
        await sendCredentialsEmail(parentUser.email, title, message);
      }
      if (parentUser) {
        await sendPushNotifications(
          [parentUser.pushToken],
          title,
          message,
          { type: "notification", notificationId: notification._id },
        );
      }
    }

    res.status(201).json({
      message: "تم إرسال الإشعار بنجاح",
      notification,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getParentNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      school: req.user.school,
      $or: [{ target: "all" }, { target: "parent", parent: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name role");

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getAllNotifications = async (req, res) => {
  try {
    const filter = scopeFilter(req);

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its notifications.",
      });
    }

    // The school's announcement log — deliberately excludes the per-parent
    // notices generated automatically by a teacher's grading/behavior/
    // homework/board-note actions, which are the parent's feed, not an
    // administrative record. Without this, a single grading session buries
    // every real announcement under one row per student.
    const notifications = await Notification.find({
      ...filter,
      type: { $nin: ["homework", "homeworkGrade", "behavior", "boardNote"] },
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name role");

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// A teacher's own list — only the notifications they personally sent, never
// the school's full broadcast log (that stays admin-only via
// getAllNotifications above).
exports.getMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      createdBy: req.user.id,
      school: req.user.school,
      // Same reasoning as getAllNotifications: this list is "messages I
      // wrote", not the automatic notices my grading actions triggered.
      type: { $nin: ["homework", "homeworkGrade", "behavior", "boardNote"] },
    })
      .sort({ createdAt: -1 })
      .populate("parent", "firstName lastName");

    res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    const notificationId = req.params.id;

    const existing = await Notification.findById(notificationId);
    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "الإشعار غير موجود" });
    }

    if (
      req.user.role === "teacher" &&
      existing.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: "غير مصرح لك بتعديل هذا الإشعار" });
    }

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { title, message },
      { new: true, runValidators: true },
    );

    res.json({
      message: "تم تحديث الإشعار بنجاح",
      notification,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id;

    const notification = await Notification.findById(notificationId);

    if (!notification || !sameSchool(req, notification)) {
      return res.status(404).json({ message: "الإشعار غير موجود" });
    }

    if (
      req.user.role === "teacher" &&
      notification.createdBy.toString() !== req.user.id
    ) {
      return res.status(403).json({ message: "غير مصرح لك بحذف هذا الإشعار" });
    }

    await notification.deleteOne();

    res.json({ message: "تم حذف الإشعار بنجاح" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
