const jwt = require("jsonwebtoken");
const User = require("../models/User");
const School = require("../models/School");


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
      const school = await School.findById(user.school).select("active features");
      if (!school || !school.active) {
        return res.status(403).json({
          message: "عذرًا، وصول هذه المدرسة إلى النظام موقوف مؤقتًا. تواصل مع إدارة المنصة.",
        });
      }
      req.userSchool = school;
    }

    req.user = user;

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
