const Schedule = require("../models/Schedule");
const User = require("../models/User");
const Classroom = require("../models/Classroom");
const Subject = require("../models/Subject");
const Grade = require("../models/Grade");
const BellSchedule = require("../models/BellSchedule");
const ClassAssignment = require("../models/ClassAssignment");
const Student = require("../models/Student");
const { asTakenBy } = require("../utils/secondLanguage");
const {
  scopeFilter,
  sameSchool,
  creationSchool,
  inStage,
  STAGE_DENIED,
} = require("../utils/tenant");
const {
  DAY_NAMES,
  periodLabel,
  timesOverlap,
  findBellFor,
  slotFor,
} = require("../utils/periods");

// Resolves the bell schedule that times this classroom on this day, or
// explains why there isn't one. Returns { bell } or { error }.
const bellForClassroomDay = async (classroomDoc, day) => {
  const bells = await BellSchedule.find({ school: classroomDoc.school }).lean();
  const bell = findBellFor(bells, classroomDoc.grade, day);
  if (!bell) {
    const grade = await Grade.findById(classroomDoc.grade).select("name");
    return {
      error: `مفيش مواعيد حصص متحددة لـ${grade?.name || "المرحلة دي"} يوم ${DAY_NAMES[day] || day}. حددها من صفحة "مواعيد الحصص" الأول.`,
    };
  }
  return { bell };
};

// Explains a clash in terms the admin can act on — which period, and
// whether it's this classroom that's already booked or the teacher who is
// teaching somewhere else at that moment.
const describeConflict = (period, conflict, classroomId) => {
  const label = periodLabel(period);
  if (String(conflict.classroom?._id || conflict.classroom) === String(classroomId)) {
    return `${label}: الفصل عنده حصة بالفعل في الوقت ده.`;
  }
  // Classroom names here already read "فصل 1/1", so only add the word when
  // the name doesn't carry it.
  const roomName = conflict.classroom?.name || "";
  const where = roomName
    ? ` في ${roomName.trim().startsWith("فصل") ? roomName : `فصل ${roomName}`}`
    : "";
  return `${label}: المعلم عنده حصة تانية${where} في نفس الوقت (${conflict.startTime}–${conflict.endTime}).`;
};

// A subject the school already assigned to a teacher in this class
// (models/ClassAssignment.js) is timetabled with that teacher, not another.
// Returns the refusal message, or null when the lesson agrees (or the class
// has no assignment for that subject — the timetable decides alone then).
const assignmentMismatch = async (classroomId, subjectId, teacherId) => {
  if (!classroomId || !subjectId) return null;
  const assignment = await ClassAssignment.findOne({ classroom: classroomId, subject: subjectId })
    .populate("teacher", "firstName lastName");
  if (!assignment || String(assignment.teacher?._id) === String(teacherId)) return null;
  return `المادة دي في الفصل ده متسندة لأ. ${assignment.teacher?.firstName} ${assignment.teacher?.lastName} — غيّر الإسناد من صفحة "إسناد الفصول" لو عايز معلم تاني.`;
};

// A period that names only a subject (طابور, نشاط, مكتبة) — on the class's
// timetable and nowhere else. Kept apart from the teacher path below rather
// than threaded through it, so booking an ordinary lesson runs exactly as it
// always has. None of the teacher's rules apply; what is left is that the
// subject is taught to this grade and the class is free at that time.
const createTeacherlessSchedule = async (req, res, { classroom, day, subjectId, periods, school }) => {
  if (!subjectId) {
    return res.status(400).json({ message: "اختار المادة — الحصة من غير معلم لازم يبقى ليها اسم مادة." });
  }

  const classroomData = await Classroom.findById(classroom);
  if (!classroomData || classroomData.school.toString() !== school.toString()) {
    return res.status(404).json({ message: "Classroom not found" });
  }
  if (!inStage(req, classroomData.grade)) {
    return res.status(403).json({ message: STAGE_DENIED });
  }

  const subjectDoc = await Subject.findById(subjectId);
  if (
    !subjectDoc ||
    String(subjectDoc.school) !== String(school) ||
    !subjectDoc.coversGrade(classroomData.grade)
  ) {
    return res.status(400).json({ message: "هذه المادة لا تُدرَّس للمرحلة الخاصة بهذا الفصل." });
  }

  const { bell, error: bellError } = await bellForClassroomDay(classroomData, day);
  if (bellError) return res.status(400).json({ message: bellError });

  const missing = periods.filter((p) => !slotFor(bell, p));
  if (missing.length > 0) {
    return res.status(400).json({
      message: `${missing.map(periodLabel).join(" و")} مش موجودة يوم ${DAY_NAMES[day]} للمرحلة دي.`,
    });
  }

  const slots = periods.map((period) => {
    const slot = slotFor(bell, period);
    return { period, startTime: slot.startTime, endTime: slot.endTime };
  });

  const existing = await Schedule.find({ day, classroom }).populate("classroom", "name");
  const problems = slots
    .map((slot) => {
      const conflict = existing.find((sch) => timesOverlap(slot, sch));
      return conflict ? describeConflict(slot.period, conflict, classroom) : null;
    })
    .filter(Boolean);
  if (problems.length > 0) {
    return res.status(400).json({ message: problems.join(" ") });
  }

  const created = await Schedule.insertMany(
    slots.map((slot) => ({
      subject: subjectDoc._id,
      classroom,
      day,
      period: slot.period,
      startTime: slot.startTime,
      endTime: slot.endTime,
      school,
    })),
  );

  return res.status(201).json({
    message:
      created.length === 1
        ? "تمت إضافة الحصة (من غير معلم)"
        : `تمت إضافة ${created.length} حصص (من غير معلم)`,
    schedules: created,
  });
};

// «مادة ثانية» — one period the class spends split between languages, each
// with its own teacher (models/Schedule.js `secondLanguage`). Booked as a
// whole: one row per language for every period asked for, the class free
// at that time and every teacher too.
//
// `replaceIds` are the rows this period takes the place of — an ordinary
// lesson being turned into «مادة ثانية», or the period itself being edited.
// They are left out of the clash check, and a row that already holds one of
// the languages at that period is kept and updated rather than deleted, so
// the registers taken on it stay attached to it.
const createSecondLanguageSchedule = async (req, res, { classroom, day, periods, school }) => {
  const options = Array.isArray(req.body.options) ? req.body.options : [];
  const picked = options
    .map((o) => ({ subject: String(o?.subjectId || o?.subject || ""), teacher: String(o?.teacher || "") }))
    .filter((o) => o.subject && o.teacher);

  if (picked.length < 2) {
    return res.status(400).json({ message: "المادة الثانية محتاجة لغتين على الأقل، كل لغة بمعلمها." });
  }
  if (new Set(picked.map((o) => o.subject)).size !== picked.length) {
    return res.status(400).json({ message: "كل لغة تتختار مرة واحدة بس." });
  }
  if (new Set(picked.map((o) => o.teacher)).size !== picked.length) {
    return res.status(400).json({ message: "المعلم مينفعش يدرّس لغتين في نفس الحصة." });
  }

  const classroomData = await Classroom.findById(classroom);
  if (!classroomData || classroomData.school.toString() !== school.toString()) {
    return res.status(404).json({ message: "Classroom not found" });
  }
  if (!inStage(req, classroomData.grade)) {
    return res.status(403).json({ message: STAGE_DENIED });
  }

  const [teachers, subjects] = await Promise.all([
    User.find({ _id: { $in: picked.map((o) => o.teacher) }, role: "teacher", school }),
    Subject.find({ _id: { $in: picked.map((o) => o.subject) }, school }),
  ]);
  for (const option of picked) {
    const teacherDoc = teachers.find((t) => String(t._id) === option.teacher);
    const subjectDoc = subjects.find((s) => String(s._id) === option.subject);
    if (!teacherDoc || !subjectDoc) {
      return res.status(404).json({ message: "معلم أو مادة من اللي اخترتهم مش موجودين." });
    }
    if (!subjectDoc.coversGrade(classroomData.grade)) {
      return res.status(400).json({ message: `${subjectDoc.name} مش بتتدرّس للمرحلة الخاصة بالفصل ده.` });
    }
    if (!(teacherDoc.teachingGrades || []).some((g) => String(g) === String(classroomData.grade))) {
      return res.status(400).json({
        message: `أ. ${teacherDoc.firstName} ${teacherDoc.lastName} مش مسموحله يدرّس المرحلة دي — راجع بيانات المعلم.`,
      });
    }
    if (!(teacherDoc.subjects || []).some((s) => String(s) === option.subject)) {
      return res.status(400).json({
        message: `${subjectDoc.name} مش من مواد أ. ${teacherDoc.firstName} ${teacherDoc.lastName}.`,
      });
    }
    // eslint-disable-next-line no-await-in-loop -- two or three languages.
    const mismatch = await assignmentMismatch(classroom, option.subject, option.teacher);
    if (mismatch) return res.status(400).json({ message: mismatch });
  }

  const replaceIds = (Array.isArray(req.body.replaceIds) ? req.body.replaceIds : []).map(String);
  const replaced = replaceIds.length
    ? await Schedule.find({ _id: { $in: replaceIds }, classroom, school })
    : [];
  if (replaced.length !== replaceIds.length) {
    return res.status(404).json({ message: "الحصة اللي بتتبدّل مش موجودة في جدول الفصل ده." });
  }

  const { bell, error: bellError } = await bellForClassroomDay(classroomData, day);
  if (bellError) return res.status(400).json({ message: bellError });

  const missing = periods.filter((p) => !slotFor(bell, p));
  if (missing.length > 0) {
    return res.status(400).json({
      message: `${missing.map(periodLabel).join(" و")} مش موجودة يوم ${DAY_NAMES[day]} للمرحلة دي.`,
    });
  }
  const slots = periods.map((period) => {
    const slot = slotFor(bell, period);
    return { period, startTime: slot.startTime, endTime: slot.endTime };
  });

  const existing = await Schedule.find({
    _id: { $nin: replaceIds },
    day,
    $or: [{ classroom }, { teacher: { $in: picked.map((o) => o.teacher) } }],
  }).populate("classroom", "name");
  const problems = [];
  for (const slot of slots) {
    const conflict = existing.find((sch) => timesOverlap(slot, sch));
    if (conflict) problems.push(describeConflict(slot.period, conflict, classroom));
  }
  if (problems.length > 0) {
    return res.status(400).json({ message: problems.join(" ") });
  }

  const reusable = [...replaced];
  const updates = [];
  const inserts = [];
  for (const slot of slots) {
    for (const option of picked) {
      const at = reusable.findIndex(
        (row) => row.day === day && row.period === slot.period && String(row.subject) === option.subject,
      );
      const fields = {
        teacher: option.teacher,
        subject: option.subject,
        classroom,
        day,
        period: slot.period,
        startTime: slot.startTime,
        endTime: slot.endTime,
        school,
        secondLanguage: true,
      };
      if (at >= 0) {
        updates.push({ updateOne: { filter: { _id: reusable[at]._id }, update: { $set: fields } } });
        reusable.splice(at, 1);
      } else {
        inserts.push(fields);
      }
    }
  }

  if (updates.length) await Schedule.bulkWrite(updates);
  if (inserts.length) await Schedule.insertMany(inserts);
  if (reusable.length) await Schedule.deleteMany({ _id: { $in: reusable.map((row) => row._id) } });

  return res.status(201).json({
    message:
      slots.length === 1
        ? "تمت إضافة حصة المادة الثانية"
        : `تمت إضافة ${slots.length} حصص مادة ثانية`,
  });
};

exports.createSchedule = async (req, res) => {
  try {
    const { teacher, classroom, day, subjectId } = req.body;

    // One request can book several periods at once (a teacher taking the
    // 2nd and 3rd back to back). A lone `period` is accepted too.
    const requested = Array.isArray(req.body.periods)
      ? req.body.periods
      : req.body.period !== undefined
        ? [req.body.period]
        : [];
    const periods = [...new Set(requested.map(Number))].sort((a, b) => a - b);

    if (periods.length === 0) {
      return res.status(400).json({ message: "اختر حصة واحدة على الأقل." });
    }
    if (!periods.every((p) => Number.isInteger(p) && p >= 1)) {
      return res.status(400).json({ message: "رقم الحصة غير صحيح." });
    }
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to create a schedule for.",
      });
    }

    if (req.body.secondLanguage === true) {
      return createSecondLanguageSchedule(req, res, { classroom, day, periods, school });
    }

    if (!teacher) {
      return createTeacherlessSchedule(req, res, { classroom, day, subjectId, periods, school });
    }

    const teacherData = await User.findOne({ _id: teacher, role: "teacher" });
    if (!teacherData || teacherData.school?.toString() !== school.toString())
      return res.status(404).json({ message: "Teacher not found" });
    const classroomData = await Classroom.findById(classroom);
    if (
      !classroomData ||
      classroomData.school.toString() !== school.toString()
    )
      return res.status(404).json({ message: "Classroom not found" });

    if (!inStage(req, classroomData.grade)) {
      return res.status(403).json({ message: STAGE_DENIED });
    }

    const isAuthorized = teacherData.teachingGrades.some(
      (gId) => gId.toString() === classroomData.grade.toString(),
    );

    if (!isAuthorized) {
      return res.status(400).json({
        message:
          "teacher is not authorized to teach this grade, please check the teacher's teaching grades and the classroom's grade.",
      });
    }
    // The timetable is where a school states which subject a teacher takes
    // for a given class, and it is what every teacher screen later reads to
    // know what it is looking at — so the slot has to name one.
    const teacherSubjects = (teacherData.subjects || []).map(String);

    if (teacherSubjects.length === 0) {
      return res.status(400).json({
        message: "لم يتم إسناد أي مادة لهذا المعلم. عدّل بيانات المعلم أولًا.",
      });
    }

    let subject = subjectId;

    if (subject) {
      if (!teacherSubjects.includes(String(subject))) {
        return res
          .status(400)
          .json({ message: "المادة المختارة ليست من مواد هذا المعلم." });
      }
    } else if (teacherSubjects.length === 1) {
      subject = teacherSubjects[0];
    } else {
      return res.status(400).json({
        message: "هذا المعلم يُدرّس أكثر من مادة — حدّد مادة الحصة.",
        needsSubject: true,
      });
    }

    const subjectDoc = await Subject.findById(subject);
    if (!subjectDoc || !subjectDoc.coversGrade(classroomData.grade)) {
      return res.status(400).json({
        message: "هذه المادة لا تُدرَّس للمرحلة الخاصة بهذا الفصل.",
      });
    }

    const mismatch = await assignmentMismatch(classroom, subject, teacher);
    if (mismatch) return res.status(400).json({ message: mismatch });

    const { bell, error: bellError } = await bellForClassroomDay(classroomData, day);
    if (bellError) return res.status(400).json({ message: bellError });

    const missing = periods.filter((p) => !slotFor(bell, p));
    if (missing.length > 0) {
      return res.status(400).json({
        message: `${missing.map(periodLabel).join(" و")} مش موجودة يوم ${DAY_NAMES[day]} للمرحلة دي.`,
      });
    }

    const slots = periods.map((period) => {
      const slot = slotFor(bell, period);
      return { period, startTime: slot.startTime, endTime: slot.endTime };
    });

    // Compared by TIME, not period number: the same period number falls at
    // different times for different grades and days, and what matters is
    // whether the teacher can physically be in both places.
    const existingSchedules = await Schedule.find({
      day,
      $or: [{ teacher }, { classroom }],
    }).populate("classroom", "name");

    // Check every requested period before writing any of them, so a clash in
    // one doesn't leave the rest half-booked.
    const problems = [];
    for (const slot of slots) {
      const conflict = existingSchedules.find((sch) => timesOverlap(slot, sch));
      if (conflict) problems.push(describeConflict(slot.period, conflict, classroom));
    }

    if (problems.length > 0) {
      return res.status(400).json({ message: problems.join(" ") });
    }

    const created = await Schedule.insertMany(
      slots.map((slot) => ({
        teacher,
        subject,
        classroom,
        day,
        period: slot.period,
        startTime: slot.startTime,
        endTime: slot.endTime,
        school,
      })),
    );

    res.status(201).json({
      message:
        created.length === 1
          ? "تمت إضافة الحصة بنجاح"
          : `تمت إضافة ${created.length} حصص بنجاح`,
      schedules: created,
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule || !sameSchool(req, schedule))
      return res.status(404).json({ message: "this schedule does not exist" });

    await schedule.deleteOne();
    res.json({ message: "Schedule deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const { day, teacher, classroom, subject, period } = req.body;
    const scheduleId = req.params.id;
    const existingSchedule = await Schedule.findById(scheduleId);
    if (!existingSchedule || !sameSchool(req, existingSchedule)) {
      return res.status(404).json({ message: "this schedule does not exist" });
    }

    // Times are never taken from the request — they follow from the period
    // and the classroom's grade, same as on create.
    const updates = { ...req.body };
    delete updates.startTime;
    delete updates.endTime;
    delete updates.periods;
    delete updates.school;
    // An empty teacher means "no change". Removing the teacher has to be
    // asked for by name (`noTeacher: true`), so a form that simply omits the
    // field can never strip a teacher off a lesson by accident.
    const dropTeacher = req.body.noTeacher === true;
    delete updates.noTeacher;
    if (!updates.teacher || dropTeacher) delete updates.teacher;

    if (period !== undefined && !(Number.isInteger(Number(period)) && Number(period) >= 1)) {
      return res.status(400).json({ message: "رقم الحصة غير صحيح." });
    }

    const checkPeriod = period !== undefined ? Number(period) : existingSchedule.period;
    const checkClassroom = classroom || existingSchedule.classroom;
    const checkTeacher = dropTeacher ? null : teacher || existingSchedule.teacher;
    const checkDay = day || existingSchedule.day;

    let checkTimes = {
      startTime: existingSchedule.startTime,
      endTime: existingSchedule.endTime,
    };

    // Moving the day or classroom can land the same period number at a
    // different time (or on a day that doesn't have it), so re-resolve.
    if (checkPeriod) {
      const classroomDoc = await Classroom.findById(checkClassroom).select("grade school");
      if (!classroomDoc) return res.status(404).json({ message: "Classroom not found" });

      // Moving a lesson into a classroom the caller doesn't preside over
      // would place a booking they can no longer see or undo.
      if (!inStage(req, classroomDoc.grade)) {
        return res.status(403).json({ message: STAGE_DENIED });
      }

      const { bell, error: bellError } = await bellForClassroomDay(classroomDoc, checkDay);
      if (bellError) return res.status(400).json({ message: bellError });

      const slot = slotFor(bell, checkPeriod);
      if (!slot) {
        return res.status(400).json({
          message: `${periodLabel(checkPeriod)} مش موجودة يوم ${DAY_NAMES[checkDay]} للمرحلة دي.`,
        });
      }

      checkTimes = { startTime: slot.startTime, endTime: slot.endTime };
      updates.period = checkPeriod;
      updates.startTime = slot.startTime;
      updates.endTime = slot.endTime;
    }

    if (day || (teacher && !dropTeacher) || classroom || period !== undefined) {
      // With no teacher there is no teacher to double-book — and a bare
      // `{ teacher: undefined }` would be dropped from the query, leaving an
      // $or that matches every lesson of the day.
      const candidates = await Schedule.find({
        _id: { $ne: scheduleId },
        day: checkDay,
        $or: checkTeacher
          ? [{ teacher: checkTeacher }, { classroom: checkClassroom }]
          : [{ classroom: checkClassroom }],
      }).populate("classroom", "name");

      const conflict = candidates.find((sch) => timesOverlap(checkTimes, sch));
      if (conflict) {
        return res.status(400).json({
          message: describeConflict(checkPeriod, conflict, checkClassroom),
        });
      }
    }

    // The form posts `subjectId`; the document's field is `subject`. Checked
    // against the teacher who will own the slot after this edit, so moving a
    // slot to another teacher cannot leave it stamped with a subject that
    // teacher does not hold.
    const nextSubject = req.body.subjectId || subject;

    if (nextSubject && checkTeacher) {
      const ownerId = teacher || existingSchedule.teacher;
      const owner = await User.findById(ownerId).select("subjects");
      const holds = (owner?.subjects || []).some(
        (id) => String(id) === String(nextSubject),
      );

      if (!holds) {
        return res
          .status(400)
          .json({ message: "المادة المختارة ليست من مواد هذا المعلم." });
      }
    } else if (nextSubject) {
      // A lesson with no teacher: the subject only has to be one this
      // class's grade is taught.
      const classroomDoc = await Classroom.findById(checkClassroom).select("grade");
      const subjectDoc = await Subject.findById(nextSubject);
      if (!subjectDoc || !classroomDoc || !subjectDoc.coversGrade(classroomDoc.grade)) {
        return res
          .status(400)
          .json({ message: "هذه المادة لا تُدرَّس للمرحلة الخاصة بهذا الفصل." });
      }
    }

    if (checkTeacher) {
      const mismatch = await assignmentMismatch(
        checkClassroom,
        nextSubject || existingSchedule.subject,
        checkTeacher,
      );
      if (mismatch) return res.status(400).json({ message: mismatch });
    }

    const updatedSchedule = await Schedule.findByIdAndUpdate(
      scheduleId,
      {
        ...updates,
        ...(nextSubject ? { subject: nextSubject } : {}),
        ...(dropTeacher ? { $unset: { teacher: 1 } } : {}),
      },
      { new: true, runValidators: true },
    )
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      });
    res.json({
      success: true,
      message: "Schedule updated successfully",
      data: updatedSchedule,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCurrentClass = async (req, res) => {
  try {
    const now = new Date();
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const day = days[now.getDay()];
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const schedules = await Schedule.find({
      teacher: req.user.id,
      day,
    }).populate({
      path: "classroom",
      select: "name grade",
      populate: { path: "grade", select: "name academicYear" },
    });

    const currentClass = schedules.find((sch) => {
      const [sh, sm] = sch.startTime.split(":").map(Number);
      const [eh, em] = sch.endTime.split(":").map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      return currentTime >= start && currentTime <= end;
    });
    if (!currentClass) {
      return res
        .status(404)
        .json({ message: "لا يوجد حصة مجدولة لك في هذا الوقت" });
    }
    res.json(currentClass);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllSchedules = async (req, res) => {
  try {
    const filter = scopeFilter(
      req,
      req.user.role === "teacher" ? { teacher: req.user.id } : {},
      "classroom",
    );

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its schedules.",
      });
    }

    const data = await Schedule.find(filter)
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      })
      .sort({ startTime: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getTeacherSchedule = async (req, res) => {
  try {
    const data = await Schedule.find({
      teacher: req.params.id,
      school: req.user.school,
    })
      .populate({
        path: "classroom",
        select: "name grade",
        populate: { path: "grade", select: "name academicYear" },
      })
      .populate("subject", "name")
      .sort({ startTime: 1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// The parent's child in this class whose timetable is being read: the one
// named by ?student= when it is theirs, else their only child in the class.
// Null when there is no telling (two children in one class, none named).
const parentsChildIn = async (req, classroomId) => {
  const parent = await User.findById(req.user.id).select("linkedStudents");
  const children = await Student.find({
    classroom: classroomId,
    $or: [{ parent: req.user.id }, { _id: { $in: parent?.linkedStudents || [] } }],
  }).select("secondLanguage");
  if (req.query.student) {
    return children.find((c) => String(c._id) === String(req.query.student)) || null;
  }
  if (children.length === 1) return children[0];
  const languages = new Set(children.map((c) => String(c.secondLanguage || "")));
  return children.length && languages.size === 1 ? children[0] : null;
};

exports.getClassSchedule = async (req, res) => {
  try {
    const data = await Schedule.find({
      classroom: req.params.classroom,
      school: req.user.school,
    })
      .populate("teacher", "firstName lastName")
      .populate("subject", "name")
      .sort({ startTime: 1 });
    // A parent reads the class's «مادة ثانية» as their child takes it.
    if (req.user.role === "parent" && data.some((lesson) => lesson.secondLanguage)) {
      const child = await parentsChildIn(req, req.params.classroom);
      if (child) return res.json(asTakenBy(data, child));
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
