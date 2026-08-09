const jwt = require("jsonwebtoken");
const User = require("../models/User");


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

    req.user = user;

    next();

  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
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


exports.isSuperAdmin = (req, res, next) => {
  if (req.user && req.user.username === "admin_master") {
    next(); 
  } else {
    return res.status(403).json({ 
      message: "عفواً، هذه الصلاحية للمدير الرئيسي فقط ولا يحق لك تنفيذها." 
    });
  }
};
