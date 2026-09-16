const mongoose = require("mongoose");
const BellSchedule = require("../models/BellSchedule");
const Schedule = require("../models/Schedule");
const Classroom = require("../models/Classroom");
const Grade = require("../models/Grade");
const User = require("../models/User");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");
const {
  DAY_NAMES,
  periodLabel,
  validateBellShape,
  planRetime,
} = require("../utils/periods");

const pickBody = (body) => ({
  name: body.name,
  grades: body.grades,
  days: body.days,
  periods: (body.periods || []).map((p) => ({
    period: Number(p.period),
    startTime: p.startTime,
    endTime: p.endTime,
  })),
  breaks: (body.breaks || [])
    .filter((b) => b.startTime || b.endTime)
    .map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
});

const listNames = (items, max = 5) =>
  items.slice(0, max).join("، ") + (items.length > max ? ` و${items.length - max} غيرهم` : "");

// Every change to the school's bells goes through here: the candidate set is
// checked for overlapping coverage, then replayed against the timetable that
// already exists. Nothing is saved if a stored period would be left with no
// time, or if two of a teacher's periods would now overlap — the admin gets
// told exactly which, so they can fix the timetable or the times first.
const applyBells = async (school, candidateBells, persist) => {
  for (let i = 0; i < candidateBells.length; i += 1) {
    for (let j = i + 1; j < candidateBells.length; j += 1) {
      const a = candidateBells[i];
      const b = candidateBells[j];
      const grades = a.grades.filter((g) => b.grades.some((h) => String(h) === String(g)));
      const days = a.days.filter((d) => b.days.includes(d));
      if (grades.length && days.length) {
        const gradeDocs = await Grade.find({ _id: { $in: grades } }).select("name");
        return {
          error: `"${a.name}" و"${b.name}" الاتنين بيحددوا مواعيد ${listNames(gradeDocs.map((g) => g.name))} يوم ${listNames(days.map((d) => DAY_NAMES[d]))}. كل مرحلة في كل يوم ليها مجموعة مواعيد واحدة بس.`,
        };
      }
    }
  }

  const classrooms = await Classroom.find({ school }).select("name grade");
  const classroomGrade = new Map(classrooms.map((c) => [String(c._id), String(c.grade)]));
  const classroomName = new Map(classrooms.map((c) => [String(c._id), c.name]));

  const schedules = await Schedule.find({ school }).select("teacher classroom day period startTime endTime").lean();
  const plan = planRetime({ schedules, classroomGrade, bells: candidateBells });

  if (plan.orphans.length > 0) {
    const where = plan.orphans.map(
      (s) => `${classroomName.get(String(s.classroom))} يوم ${DAY_NAMES[s.day]} ${periodLabel(s.period)}`,
    );
    return {
      error: `التعديل ده هيسيب حصص متسجلة في الجدول من غير ميعاد: ${listNames(where)}. امسحها أو انقلها من صفحة الجدول الأول.`,
    };
  }

  if (plan.teacherClashes.length > 0) {
    const teacherIds = [...new Set(plan.teacherClashes.map(([a]) => String(a.teacher)))];
    const teachers = await User.find({ _id: { $in: teacherIds } }).select("firstName lastName");
    const teacherName = new Map(teachers.map((t) => [String(t._id), `${t.firstName} ${t.lastName}`]));
    const where = plan.teacherClashes.map(
      ([a, b]) =>
        `أ. ${teacherName.get(String(a.teacher))} يوم ${DAY_NAMES[a.day]} (${classroomName.get(String(a.classroom))} ${periodLabel(a.period)} مع ${classroomName.get(String(b.classroom))} ${periodLabel(b.period)})`,
    );
    return {
      error: `بالمواعيد دي هيبقى فيه معلمين عندهم حصتين في نفس الوقت: ${listNames(where, 3)}. عدّل الجدول الأول.`,
    };
  }

  const saved = await persist();
  if (plan.ops.length > 0) await Schedule.bulkWrite(plan.ops);
  return { saved, retimed: plan.ops.length };
};

const respondApplied = (res, status, result, verb) => {
  if (result.error) return res.status(400).json({ message: result.error });
  return res.status(status).json({
    success: true,
    message:
      result.retimed > 0
        ? `${verb}، واتعدّلت مواعيد ${result.retimed} حصة في الجدول.`
        : verb,
    retimed: result.retimed,
    data: result.saved,
  });
};

exports.getBellSchedules = async (req, res) => {
  try {
    const filter = scopeFilter(req);
    if (!filter) {
      return res.status(400).json({ message: "Please specify a school (?school=id)." });
    }
    const data = await BellSchedule.find(filter).populate("grades", "name").sort({ name: 1 });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createBellSchedule = async (req, res) => {
  try {
    const school = creationSchool(req);
    if (!school) {
      return res.status(400).json({ message: "Please specify a school (?school=id)." });
    }

    const body = pickBody(req.body);
    const shapeError = validateBellShape(body);
    if (shapeError) return res.status(400).json({ message: shapeError });

    const others = await BellSchedule.find({ school }).lean();
    const draft = { _id: new mongoose.Types.ObjectId(), school, ...body };

    const result = await applyBells(school, [...others, draft], () => BellSchedule.create(draft));
    return respondApplied(res, 201, result, "تمت إضافة مجموعة المواعيد");
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.updateBellSchedule = async (req, res) => {
  try {
    const existing = await BellSchedule.findById(req.params.id);
    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "مجموعة المواعيد غير موجودة" });
    }

    const body = pickBody(req.body);
    const shapeError = validateBellShape(body);
    if (shapeError) return res.status(400).json({ message: shapeError });

    const others = await BellSchedule.find({ school: existing.school, _id: { $ne: existing._id } }).lean();
    const draft = { _id: existing._id, school: existing.school, ...body };

    const result = await applyBells(existing.school, [...others, draft], () =>
      BellSchedule.findByIdAndUpdate(existing._id, body, { new: true, runValidators: true }),
    );
    return respondApplied(res, 200, result, "تم تحديث مجموعة المواعيد");
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteBellSchedule = async (req, res) => {
  try {
    const existing = await BellSchedule.findById(req.params.id);
    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "مجموعة المواعيد غير موجودة" });
    }

    const others = await BellSchedule.find({ school: existing.school, _id: { $ne: existing._id } }).lean();
    const result = await applyBells(existing.school, others, () => existing.deleteOne());
    if (result.error) return res.status(400).json({ message: result.error });

    res.json({ success: true, message: "تم حذف مجموعة المواعيد" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
