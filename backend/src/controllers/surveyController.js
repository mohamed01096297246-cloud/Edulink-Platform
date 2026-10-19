const crypto = require("crypto");
const mongoose = require("mongoose");
const School = require("../models/School");
const Grade = require("../models/Grade");
const Classroom = require("../models/Classroom");
const Student = require("../models/Student");
const Survey = require("../models/Survey");
const SurveyResponse = require("../models/SurveyResponse");

// The app-subscription survey: a page anyone with the link can answer (the
// school's stages and classes, the kind of phone, and whether they would
// pay the year's price for it), and the platform owner's view of the
// answers, class by class.

const byName = (a, b) => String(a.name).localeCompare(String(b.name), "ar");

// The school's grades that have classes, each with its classes.
const gradesWithClasses = async (schoolId) => {
  const [grades, classrooms] = await Promise.all([
    Grade.find({ school: schoolId }).select("name").lean(),
    Classroom.find({ school: schoolId }).select("name grade").lean(),
  ]);
  return grades
    .map((g) => ({
      _id: g._id,
      name: g.name,
      classrooms: classrooms
        .filter((c) => String(c.grade) === String(g._id))
        .sort(byName)
        .map((c) => ({ _id: c._id, name: c.name })),
    }))
    .filter((g) => g.classrooms.length > 0)
    .sort(byName);
};

const surveyShape = (survey) => ({
  slug: survey.slug,
  title: survey.title,
  prices: { android: survey.prices.android, iphone: survey.prices.iphone },
  open: survey.open,
  createdAt: survey.createdAt,
});

// ---------------------------------------------------------------------------
// Public: no login.
// ---------------------------------------------------------------------------

exports.getPublicSurvey = async (req, res) => {
  try {
    const survey = await Survey.findOne({ slug: req.params.slug }).lean();
    if (!survey) {
      return res.status(404).json({ success: false, message: "هذا الاستبيان غير موجود." });
    }
    const school = await School.findById(survey.school).select("name active").lean();
    if (!school || !school.active) {
      return res.status(404).json({ success: false, message: "هذا الاستبيان غير موجود." });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...surveyShape(survey),
        school: school.name,
        grades: survey.open ? await gradesWithClasses(survey.school) : [],
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitResponse = async (req, res) => {
  try {
    const survey = await Survey.findOne({ slug: req.params.slug }).lean();
    if (!survey) {
      return res.status(404).json({ success: false, message: "هذا الاستبيان غير موجود." });
    }
    if (!survey.open) {
      return res.status(403).json({ success: false, message: "تم إغلاق هذا الاستبيان، شكرًا لاهتمامك." });
    }

    const { classroomId, phone, subscribe } = req.body || {};
    if (!["android", "iphone"].includes(phone)) {
      return res.status(400).json({ success: false, message: "اختر نوع الهاتف." });
    }
    if (typeof subscribe !== "boolean") {
      return res.status(400).json({ success: false, message: "اختر نعم أو لا." });
    }
    if (!mongoose.Types.ObjectId.isValid(classroomId)) {
      return res.status(400).json({ success: false, message: "اختر الفصل." });
    }
    const classroom = await Classroom.findOne({ _id: classroomId, school: survey.school }).select("grade").lean();
    if (!classroom) {
      return res.status(400).json({ success: false, message: "اختر الفصل." });
    }

    // Without a login nothing stops a page being sent again and again, so a
    // survey takes at most three answers per student the school has.
    const [answered, students] = await Promise.all([
      SurveyResponse.countDocuments({ survey: survey._id }),
      Student.countDocuments({ school: survey.school, active: true }),
    ]);
    if (answered >= Math.max(500, students * 3)) {
      return res.status(429).json({ success: false, message: "وصل الاستبيان إلى الحد الأقصى لعدد الردود." });
    }

    await SurveyResponse.create({
      survey: survey._id,
      school: survey.school,
      grade: classroom.grade,
      classroom: classroom._id,
      phone,
      subscribe,
      price: survey.prices[phone],
    });

    return res.status(201).json({ success: true, message: "شكرًا لك، تم تسجيل ردك." });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ---------------------------------------------------------------------------
// The platform owner (schools page).
// ---------------------------------------------------------------------------

const results = async (survey) => {
  const [grades, responses, sizes] = await Promise.all([
    gradesWithClasses(survey.school),
    SurveyResponse.find({ survey: survey._id }).select("classroom phone subscribe price").lean(),
    Student.aggregate([
      { $match: { school: survey.school, active: true } },
      { $group: { _id: "$classroom", n: { $sum: 1 } } },
    ]),
  ]);
  const studentsIn = new Map(sizes.map((s) => [String(s._id), s.n]));

  const tally = (list) => ({
    responses: list.length,
    yes: list.filter((r) => r.subscribe).length,
    no: list.filter((r) => !r.subscribe).length,
    android: list.filter((r) => r.phone === "android").length,
    iphone: list.filter((r) => r.phone === "iphone").length,
  });

  const classes = grades.flatMap((g) =>
    g.classrooms.map((c) => ({
      gradeId: g._id,
      grade: g.name,
      classroomId: c._id,
      classroom: c.name,
      students: studentsIn.get(String(c._id)) || 0,
      ...tally(responses.filter((r) => String(r.classroom) === String(c._id))),
    })),
  );

  const yes = responses.filter((r) => r.subscribe);
  return {
    totals: {
      ...tally(responses),
      students: [...studentsIn.values()].reduce((a, b) => a + b, 0),
      yesAndroid: yes.filter((r) => r.phone === "android").length,
      yesIphone: yes.filter((r) => r.phone === "iphone").length,
      // A year's subscriptions if everyone who said yes paid the price they
      // were shown.
      revenue: yes.reduce((sum, r) => sum + r.price, 0),
    },
    classes,
  };
};

const schoolOr404 = async (req, res) => {
  const { schoolId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(schoolId)) {
    res.status(404).json({ success: false, message: "المدرسة غير موجودة." });
    return null;
  }
  const school = await School.findById(schoolId).select("name").lean();
  if (!school) {
    res.status(404).json({ success: false, message: "المدرسة غير موجودة." });
    return null;
  }
  return school;
};

exports.getSchoolSurvey = async (req, res) => {
  try {
    const school = await schoolOr404(req, res);
    if (!school) return undefined;
    const survey = await Survey.findOne({ school: school._id }).lean();
    if (!survey) return res.status(200).json({ success: true, data: { survey: null } });
    return res.status(200).json({
      success: true,
      data: { survey: surveyShape(survey), ...(await results(survey)) },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Starts the school's survey, or hands back the one it already has.
exports.createSchoolSurvey = async (req, res) => {
  try {
    const school = await schoolOr404(req, res);
    if (!school) return undefined;
    let survey = await Survey.findOne({ school: school._id });
    if (!survey) {
      survey = await Survey.create({
        school: school._id,
        slug: crypto.randomBytes(5).toString("hex"),
      });
    }
    return res.status(201).json({ success: true, data: { survey: surveyShape(survey) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// Opens or closes it.
exports.updateSchoolSurvey = async (req, res) => {
  try {
    const school = await schoolOr404(req, res);
    if (!school) return undefined;
    if (typeof req.body?.open !== "boolean") {
      return res.status(400).json({ success: false, message: "حدد إذا كان الاستبيان مفتوح ولا مقفول." });
    }
    const survey = await Survey.findOneAndUpdate(
      { school: school._id },
      { $set: { open: req.body.open } },
      { new: true },
    );
    if (!survey) {
      return res.status(404).json({ success: false, message: "المدرسة دي مفيهاش استبيان." });
    }
    return res.status(200).json({ success: true, data: { survey: surveyShape(survey) } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
