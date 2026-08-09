const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ message: "Username and password are required" });
    }

    const user = await User.findOne({ username: username.trim() }).select(
      "+password",
    );

    if (!user) {
      return res
        .status(401)
        .json({ message: "Username or password is incorrect" });
    }

    if (!user.active) {
      return res
        .status(403)
        .json({
          message:
            "This account is currently disabled, please contact administration",
        });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Username or password is incorrect" });
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
      },
    });
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
    res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
