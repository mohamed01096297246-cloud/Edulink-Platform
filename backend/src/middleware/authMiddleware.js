const jwt = require("jsonwebtoken");
const User = require("../models/User");
const School = require("../models/School");
const {
  resolveStageScope,
  resolvePickedStage,
  hasStagePrincipals,
} = require("../utils/tenant");

// The school's day-to-day records, as opposed to the things that belong to
// running the school itself. Once a school is split into stages, entering
// and changing what's in this list is the stage principals' work; whoever
// oversees the whole school reads it rather than edits it. They keep the
// rest — admin accounts, bell times, announcements, the staff register —
// because those cross the stages and nobody else can reach all of them.
const STAGE_RUN_DATA =
  /^\/api\/(students|classrooms|grades|subjects|schedules|exams|results|homework|homework-results|behavior|attendance|monthly-grades|weekly-evaluation|coursework|cover-sessions|grade-register|classwork-notebook|board-notes|fees|teacher|parent)(\/|$)/;


exports.protect = async (req, res, next) => {
  try {
    let token;


    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({
        message: "Not authorized, no token"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);


    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({
        message: "User not found"
      });
    }

    if (!user.active) {
      return res.status(403).json({
        message: "User is inactive"
      });
    }

    // Cuts off access the instant the platform owner suspends a school —
    // not just at the next login. A school's own admin/teacher/parent has
    // no other way to reach the API, so this one check (plus the same
    // check in authController.login) is the entire enforcement point for
    // "stop a whole school from using the platform/app".
    if (user.school) {
      const school = await School.findById(user.school).select("active features parentInbox");
      if (!school || !school.active) {
        return res.status(403).json({
          message: "عذرًا، وصول هذه المدرسة إلى النظام موقوف مؤقتًا. تواصل مع إدارة المنصة.",
        });
      }
      req.userSchool = school;
    }

    req.user = user;

    // A principal over part of the school reaches only the grades of their
    // own stages. Resolved here, once, rather than per query — and here
    // rather than in each controller, so an endpoint can't be written that
    // quietly skips it. Costs nothing for everyone else: whole-school
    // admins, teachers and parents all resolve to null without a query.
    req.stageScope = await resolveStageScope(user);
    req.pickedStage = await resolvePickedStage(req);

    // An admin over a whole school that has appointed principals is there
    // to oversee it, not to run it. Enforced here, by method and path,
    // rather than route by route — the same reason the stage scope is
    // resolved here: a new endpoint can't quietly opt out of it.
    req.oversightOnly =
      user.role === "admin" &&
      !user.isSuperAdmin &&
      !req.stageScope &&
      (await hasStagePrincipals(user.school));

    if (
      req.oversightOnly &&
      req.method !== "GET" &&
      STAGE_RUN_DATA.test(req.originalUrl.split("?")[0])
    ) {
      return res.status(403).json({
        message:
          "الإدارة العامة بتتابع بيانات المدرسة ومش بتعدّلها — الإضافة والتعديل من صلاحية مدير المرحلة المختصة.",
      });
    }

    next();

  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
};

// Gates a route behind one of the per-school module toggles (School.features)
// — e.g. a subscription tier that doesn't include Fees. Must run after
// `protect`, which populates `req.userSchool`. The platform super-admin has
// no school of their own and never hits school-scoped feature routes, so
// they're waved through.
exports.requireFeature = (featureKey) => {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) {
      return next();
    }
    if (!req.userSchool || req.userSchool.features?.[featureKey] === false) {
      return res.status(403).json({
        message: "عذرًا، هذه الميزة غير مفعّلة لباقة مدرستك الحالية. تواصل مع إدارة المنصة لتفعيلها.",
      });
    }
    next();
  };
};


// Gates a route behind one specific user's own appFeatures — finer than
// requireFeature above, which only knows about the whole school. This lets
// an admin give one parent or teacher a narrower slice of the app than
// their school's plan otherwise allows (e.g. a trial account, a
// per-guardian tier) without touching anyone else at that school. Must run
// after `protect`. Super-admin has no per-user app features and never hits
// these routes as themselves, so they're waved through too.
exports.requireUserFeature = (featureKey) => {
  return (req, res, next) => {
    if (req.user?.isSuperAdmin) {
      return next();
    }
    if (req.user?.appFeatures?.[featureKey] === false) {
      return res.status(403).json({
        message: "عذرًا، هذه الميزة غير متاحة لحسابك حاليًا. تواصل مع إدارة المدرسة.",
      });
    }
    next();
  };
};


// Blocks a route that can't be reasoned about one stage at a time. Bell
// times are the case that forced this: saving them is validated against
// the whole school at once, because a teacher's periods clash across
// stages, so a principal over one stage can't be the one to change them —
// they'd be refused by conditions in classrooms they can't see. Such
// settings belong to whoever oversees the whole school.
exports.requireWholeSchool = (req, res, next) => {
  if (req.stageScope) {
    return res.status(403).json({
      message:
        "هذا الإعداد يخص المدرسة كلها، وتعديله من صلاحية إدارة المدرسة العامة وليس إدارة مرحلة بعينها.",
    });
  }
  next();
};


exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Access denied"
      });
    }

    next();
  };
};


// Platform-level operator, not a school's own admin — checks the
// authoritative `isSuperAdmin` flag on the user document instead of the
// old scattered `username === "admin_master"` string checks.
exports.requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.isSuperAdmin) {
    next();
  } else {
    return res.status(403).json({
      message: "عفواً، هذه الصلاحية للمدير الرئيسي فقط ولا يحق لك تنفيذها."
    });
  }
};
