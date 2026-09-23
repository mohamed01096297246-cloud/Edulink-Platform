const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendPushNotifications } = require("./pushNotifications");

// The single place every teacher action that concerns a specific child's
// parent should go through — persists an in-app Notification (so it shows
// up in the parent's "آخر الأنشطة" home widget and notifications screen)
// AND fires a push to their phone, from one call. Never throws: a
// notification failure should never break the action that triggered it.
//
// Students in preparatory and secondary hold their own accounts, so the
// same notice reaches the child as well as the parent. The one exception
// is a negative behaviour note: that one goes to the parent alone, so that
// teachers keep recording them honestly. Callers say so with
// `alsoStudent: false`, and may reword the child's copy with
// `studentTitle` / `studentMessage` — a parent reads "محمد: 8/10", the
// child reads "درجتك: 8/10".

// The student accounts belonging to these student records, for the ones
// that have an account at all (younger years have none by design).
const accountsForStudents = async (studentIds) => {
  if (!studentIds.length) return new Map();

  const accounts = await User.find({
    role: "student",
    active: true,
    studentProfile: { $in: studentIds },
  }).select("studentProfile pushToken");

  return new Map(accounts.map((a) => [String(a.studentProfile), a]));
};

// Same message to every parent of the given students (e.g. "new homework"
// fans out identically to a whole classroom). `students` must already
// have `.parent` populated with at least `_id` and `pushToken`.
exports.notifyParentsOfStudents = async ({
  students,
  type,
  title,
  message,
  school,
  createdBy,
  alsoStudent = true,
  studentTitle,
  studentMessage,
}) => {
  try {
    const parentsMap = new Map();
    (students || []).forEach((student) => {
      if (student.parent) {
        parentsMap.set(student.parent._id.toString(), student.parent);
      }
    });
    const parents = Array.from(parentsMap.values());

    if (parents.length) {
      await Notification.insertMany(
        parents.map((parent) => ({
          title,
          message,
          target: "parent",
          parent: parent._id,
          student: null,
          type,
          createdBy,
          school,
        })),
      );

      await sendPushNotifications(
        parents.map((p) => p.pushToken),
        title,
        message,
        { type },
      );
    }

    if (!alsoStudent) return;

    const accounts = await accountsForStudents((students || []).map((s) => s._id));
    if (!accounts.size) return;

    const rows = [];
    const tokens = [];
    (students || []).forEach((student) => {
      const account = accounts.get(String(student._id));
      if (!account) return;
      rows.push({
        title: studentTitle || title,
        message: studentMessage || message,
        target: "student",
        user: account._id,
        student: student._id,
        type,
        createdBy,
        school,
      });
      tokens.push(account.pushToken);
    });

    await Notification.insertMany(rows);
    await sendPushNotifications(tokens, studentTitle || title, studentMessage || message, {
      type,
    });
  } catch (err) {
    console.log("notifyParentsOfStudents error:", err.message);
  }
};

// One parent, one specific child, a personalized message (e.g. "فلان
// أخذ 8/10 في واجب كذا") — used wherever the message varies per student
// (grading, behavior notes), unlike the broadcast helper above.
exports.notifyParent = async ({
  parentId,
  pushToken,
  studentId,
  type,
  title,
  message,
  school,
  createdBy,
  alsoStudent = true,
  studentTitle,
  studentMessage,
}) => {
  try {
    if (parentId) {
      await Notification.create({
        title,
        message,
        target: "parent",
        parent: parentId,
        student: studentId || null,
        type,
        createdBy,
        school,
      });

      if (pushToken) {
        await sendPushNotifications([pushToken], title, message, { type });
      }
    }

    if (!alsoStudent || !studentId) return;

    const account = (await accountsForStudents([studentId])).get(String(studentId));
    if (!account) return;

    await Notification.create({
      title: studentTitle || title,
      message: studentMessage || message,
      target: "student",
      user: account._id,
      student: studentId,
      type,
      createdBy,
      school,
    });

    if (account.pushToken) {
      await sendPushNotifications(
        [account.pushToken],
        studentTitle || title,
        studentMessage || message,
        { type },
      );
    }
  } catch (err) {
    console.log("notifyParent error:", err.message);
  }
};
