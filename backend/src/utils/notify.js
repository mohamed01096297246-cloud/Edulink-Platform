const Notification = require("../models/Notification");
const { sendPushNotifications } = require("./pushNotifications");

// The single place every teacher action that concerns a specific child's
// parent should go through — persists an in-app Notification (so it shows
// up in the parent's "آخر الأنشطة" home widget and notifications screen)
// AND fires a push to their phone, from one call. Never throws: a
// notification failure should never break the action that triggered it.

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
}) => {
  try {
    const parentsMap = new Map();
    (students || []).forEach((student) => {
      if (student.parent) {
        parentsMap.set(student.parent._id.toString(), student.parent);
      }
    });
    const parents = Array.from(parentsMap.values());

    if (parents.length === 0) return;

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
}) => {
  try {
    if (!parentId) return;

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
  } catch (err) {
    console.log("notifyParent error:", err.message);
  }
};
