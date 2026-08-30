const User = require("../models/User");
const School = require("../models/School");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "من فضلك أدخل اسم المستخدم وكلمة المرور" });
    }

    const user = await User.findOne({ username: username.trim() }).select("+password");

    if (!user) {
      return res
        .status(401)
        .json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }

    if (!user.active) {
      return res
        .status(403)
        .json({
          message:
            "هذا الحساب موقوف حاليًا، برجاء التواصل مع إدارة المدرسة",
        });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
    }

    let school = null;
    if (user.school) {
      school = await School.findById(user.school).select("active features");
      if (!school || !school.active) {
        return res.status(403).json({
          message:
            "عذرًا، وصول هذه المدرسة إلى النظام موقوف مؤقتًا. تواصل مع إدارة المنصة.",
        });
      }
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        subject: user.subject || null,
        school: user.school || null,
        isSuperAdmin: user.isSuperAdmin || false,
        isPrimaryAdmin: user.isPrimaryAdmin || false,
        features: school?.features || null,
        appFeatures: user.appFeatures || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Saves the device's Expo push token so the backend can push notifications
// to it later. Called by the mobile app right after login/session-restore,
// once the user has granted notification permission.
exports.updatePushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;

    if (!pushToken) {
      return res.status(400).json({ message: "pushToken is required" });
    }

    await User.findByIdAndUpdate(req.user._id, { pushToken });

    res.status(200).json({ message: "Push token saved" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // `protect` already loaded the school (for the active check) — reuse it
    // here so session-restore sees the same `features` a fresh login gets,
    // instead of the mobile app treating every feature as enabled after a
    // restart just because this field was missing from the response.
    const userWithFeatures = {
      ...user.toObject(),
      features: req.userSchool?.features || null,
    };
    res.status(200).json({
      success: true,
      user: userWithFeatures,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
