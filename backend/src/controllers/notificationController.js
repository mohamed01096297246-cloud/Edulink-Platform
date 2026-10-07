const Notification = require("../models/Notification");
const User = require("../models/User");
const Student = require("../models/Student");
const Classroom = require("../models/Classroom");
const { teacherClassroomIds } = require("../utils/teacherClassrooms");
const { sendPushNotifications } = require("../utils/pushNotifications");
const {
  scopeFilter,
  sameSchool,
  creationSchool,
  stageParentWhere,
  stageStudentWhere,
  stagesOfParent,
} = require("../utils/tenant");

// A teacher only ever notifies parents of students they actually teach —
// never the whole school. Same source of truth as every other per-teacher
// screen (Schedule → classroom → student), collapsed to the unique set of
// parents, each carrying the names of the teacher's own students under them
// (a parent can have more than one child in the same class/teacher).
const getTeacherParents = async (teacherId) => {
  // Timetabled classes and assigned ones alike (utils/teacherClassrooms).
  const classroomIds = await teacherClassroomIds(teacherId);

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

// Everyone a message to these classes reaches: the parents of their
// students, and the students' own accounts (preparatory and secondary).
const recipientsOfClassrooms = async (classroomIds) => {
  const students = await Student.find({
    classroom: { $in: classroomIds },
    active: true,
  }).select("parent");
  const parentIds = [...new Set(students.map((s) => String(s.parent)).filter(Boolean))];
  const [parents, studentAccounts] = await Promise.all([
    User.find({ _id: { $in: parentIds }, role: "parent" }).select("pushToken"),
    User.find({ role: "student", active: true, studentProfile: { $in: students.map((s) => s._id) } }).select("pushToken"),
  ]);
  return [...parents, ...studentAccounts];
};

// The classes a teacher can address, for the picker on their notifications
// screen.
exports.getTeacherClassroomsList = async (req, res) => {
  try {
    const classrooms = await Classroom.find({ _id: { $in: await teacherClassroomIds(req.user.id) } })
      .populate("grade", "name")
      .select("name grade")
      .sort({ name: 1 })
      .lean();
    res.status(200).json({
      success: true,
      data: classrooms.map((c) => ({ _id: c._id, name: c.name, grade: c.grade?.name || "" })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
    const { title, message, parentId } = req.body;
    let { target } = req.body;
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
    //
    // "all" from a teacher means all of their own classes, and "classrooms"
    // the ones they picked (each of which must be theirs). Either way the
    // notice is stored narrowed to those classes, so it appears only in the
    // feeds of families with a child there — not only pushed to them.
    let recipients = null;
    let classrooms = [];
    if (req.user.role === "teacher") {
      if (target === "parent") {
        const parentsMap = await getTeacherParents(req.user.id);
        if (!parentsMap.has(parentId)) {
          return res.status(403).json({
            message: "غير مصرح لك بإرسال إشعار لولي أمر هذا ليس من طلابك.",
          });
        }
        recipients = [parentsMap.get(parentId).parent];
      } else {
        const mine = await teacherClassroomIds(req.user.id);
        if (target === "classrooms") {
          const picked = [...new Set((req.body.classroomIds || []).map(String))];
          if (picked.length === 0) {
            return res.status(400).json({ message: "اختار فصل واحد على الأقل." });
          }
          if (!picked.every((id) => mine.includes(id))) {
            return res.status(403).json({ message: "غير مصرح لك بإرسال إشعار لفصل مش من فصولك." });
          }
          classrooms = picked;
        } else {
          classrooms = mine;
        }
        if (classrooms.length === 0) {
          return res.status(400).json({ message: "مفيش فصول مسندة ليك لسه." });
        }
        target = "all";
        recipients = await recipientsOfClassrooms(classrooms);
      }
    }

    // An admin can narrow a notice to part of the school: one grade (every
    // class in it) or the classes they pick. Stored like a teacher's — as
    // `target: "all"` narrowed to those classes — so it shows only in the
    // feeds of families and students with a child there.
    if (req.user.role !== "teacher" && (target === "grade" || target === "classrooms")) {
      const wanted =
        target === "grade"
          ? { grade: req.body.gradeId }
          : { _id: { $in: [...new Set((req.body.classroomIds || []).map(String))] } };
      if (target === "grade" && !req.body.gradeId) {
        return res.status(400).json({ message: "اختار المرحلة." });
      }
      if (target === "classrooms" && !(req.body.classroomIds || []).length) {
        return res.status(400).json({ message: "اختار فصل واحد على الأقل." });
      }

      // Only classes of the sender's own school — and stages, for a principal.
      const found = await Classroom.find(scopeFilter(req, wanted, "grade")).select("_id").lean();
      if (target === "classrooms" && found.length !== new Set(req.body.classroomIds.map(String)).size) {
        return res.status(403).json({ message: "فيه فصل مش من الفصول اللي تقدر تبعتلها." });
      }
      if (found.length === 0) {
        return res.status(400).json({ message: "المرحلة دي مافيهاش فصول." });
      }

      classrooms = found.map((c) => c._id);
      target = "all";
      recipients = await recipientsOfClassrooms(classrooms);
    }

    // The same rule for a principal over part of the school: a named
    // recipient has to be one of their own families. Checked before the
    // notice is written, not just before it is pushed — an unsent notice
    // still shows up in the parent's feed.
    if (req.stageScope && target === "parent") {
      const inStage = await User.exists({
        _id: parentId,
        school,
        ...(await stageParentWhere(req)),
      });

      if (!inStage) {
        return res.status(403).json({
          message: "غير مصرح لك بإرسال إشعار لولي أمر خارج المراحل التي تديرها.",
        });
      }
    }

    const notification = await Notification.create({
      title,
      message,
      target: target || "all",
      parent: target === "parent" ? parentId : null,
      stages: req.stageScope ? req.stageScope.stages : [],
      classrooms,
      createdBy: req.user._id,
      school,
    });

    // Notifications go out by push only. Email is reserved for handing over
    // login credentials; a parent's inbox is not a second notification feed.
    if (req.user.role === "teacher" || classrooms.length > 0) {
      await sendPushNotifications(
        recipients.map((p) => p.pushToken),
        title,
        message,
        { type: "notification", notificationId: notification._id },
      );
    } else if (target === "all" || !target) {
      // "Everyone" means everyone the sender presides over — for a stage
      // principal that is their own stage's families, not the school's.
      const parents = await User.find({
        role: "parent",
        school,
        ...(await stageParentWhere(req)),
      });

      // Students of those same stages hold their own accounts and hear the
      // school's announcements themselves — the notice document is shared
      // (target "all"), so only the push has to reach them too.
      const stageWhere = await stageStudentWhere(req);
      const students = await User.find({
        role: "student",
        active: true,
        school,
        ...(stageWhere.student ? { studentProfile: stageWhere.student } : {}),
      }).select("pushToken");

      await sendPushNotifications(
        [...parents, ...students].map((p) => p.pushToken),
        title,
        message,
        { type: "notification", notificationId: notification._id },
      );
    } else if (target === "parent") {
      const parentUser = await User.findOne({
        _id: parentId,
        school,
        ...(await stageParentWhere(req)),
      });

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
    // An announcement addressed to part of the school reaches this family
    // only if one of their children is in it. A notice with no stages is
    // the school's own and reaches everyone — which is every notice sent
    // before stages existed, and every notice from whoever oversees the
    // whole school.
    const stages = await stagesOfParent(req.user);
    // A notice narrowed to classes (a teacher's) shows only to families with
    // a child in one of them.
    const myClassrooms = (
      await Student.find({ _id: { $in: req.user.linkedStudents || [] } }).distinct("classroom")
    ).filter(Boolean);

    const notifications = await Notification.find({
      school: req.user.school,
      $or: [
        {
          target: "all",
          // `$exists: false` is not redundant with `$size: 0`: every notice
          // written before this field existed has no `stages` key at all,
          // and `$size` matches only an array that is actually there. Without
          // it, adding this filter would have emptied every parent's feed.
          $and: [
            {
              $or: [
                { stages: { $exists: false } },
                { stages: { $size: 0 } },
                { stages: { $in: stages } },
              ],
            },
            {
              $or: [
                { classrooms: { $exists: false } },
                { classrooms: { $size: 0 } },
                { classrooms: { $in: myClassrooms } },
              ],
            },
          ],
        },
        { target: "parent", parent: req.user._id },
      ],
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "firstName lastName role")
      .lean();

    // `readBy` is a per-school list that could name any parent; the client
    // only ever needs to know about the one asking, so flatten it to a
    // boolean here rather than shipping other parents' ids to the app.
    const userId = req.user._id.toString();
    const withReadState = notifications.map(({ readBy, ...rest }) => ({
      ...rest,
      read: (readBy || []).some((id) => id.toString() === userId),
    }));

    res.json(withReadState);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Marks notifications as read for the calling user. Takes a list of ids so
// opening the screen can settle everything currently on it in one request
// instead of one call per row.
exports.markNotificationsRead = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "لا يوجد إشعارات لتحديدها كمقروءة." });
    }

    await Notification.updateMany(
      {
        _id: { $in: ids },
        school: req.user.school,
        // Same visibility rule as the list above — a user can only mark
        // something read if it was addressed to them in the first place.
        $or: [{ target: "all" }, { target: "parent", parent: req.user._id }],
      },
      // addToSet, not push: re-opening the screen must not append the same
      // user id over and over.
      { $addToSet: { readBy: req.user._id } },
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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
      .populate("createdBy", "firstName lastName role")
      // So the log can say which classes a narrowed notice went to.
      .populate({ path: "classrooms", select: "name grade", populate: { path: "grade", select: "name" } });

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
      .populate("parent", "firstName lastName")
      .populate({ path: "classrooms", select: "name grade", populate: { path: "grade", select: "name" } });

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
