const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendCredentialsEmail } = require("../utils/emailService");
const { sendPushNotifications } = require("../utils/pushNotifications");
const { scopeFilter, sameSchool, creationSchool } = require("../utils/tenant");

exports.createNotification = async (req, res) => {
  try {
    const { title, message, target, parentId } = req.body;
    const school = creationSchool(req);

    if (!school) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to notify.",
      });
    }

    if (target === "parent" && !parentId) {
      return res.status(400).json({
        message: "parentId is required when target is parent",
      });
    }

    const notification = await Notification.create({
      title,
      message,
      target: target || "all",
      parent: target === "parent" ? parentId : null,
      createdBy: req.user._id,
      school,
    });

    if (target === "all" || !target) {
      const parents = await User.find({ role: "parent", school });

      for (let p of parents) {
        if (p.email) {
          await sendCredentialsEmail(p.email, title, message);
        }
      }
      await sendPushNotifications(
        parents.map((p) => p.pushToken),
        title,
        message,
        { type: "notification", notificationId: notification._id },
      );
    }

    if (target === "parent") {
      const parentUser = await User.findById(parentId);

      if (parentUser && parentUser.email) {
        await sendCredentialsEmail(parentUser.email, title, message);
      }
      if (parentUser) {
        await sendPushNotifications(
          [parentUser.pushToken],
          title,
          message,
          { type: "notification", notificationId: notification._id },
        );
      }
    }

    res.status(201).json({
      message: "Notification created successfully",
      notification,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getParentNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      school: req.user.school,
      $or: [{ target: "all" }, { target: "parent", parent: req.user._id }],
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", "name role");

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.getAllNotifications = async (req, res) => {
  try {
    const filter = scopeFilter(req);

    if (!filter) {
      return res.status(400).json({
        message: "Please specify a school (?school=id) to list its notifications.",
      });
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .populate("createdBy", "name role");

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.updateNotification = async (req, res) => {
  try {
    const { title, message } = req.body;
    const notificationId = req.params.id;

    const existing = await Notification.findById(notificationId);
    if (!existing || !sameSchool(req, existing)) {
      return res.status(404).json({ message: "Notification not found" });
    }

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { title, message },
      { new: true, runValidators: true },
    );

    res.json({
      message: "Notification updated successfully",
      notification,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
exports.deleteNotification = async (req, res) => {
  try {
    const notificationId = req.params.id;

    const notification = await Notification.findById(notificationId);

    if (!notification || !sameSchool(req, notification)) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await notification.deleteOne();

    res.json({ message: "Notification deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
