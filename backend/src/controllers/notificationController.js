const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendCredentialsEmail } = require("../utils/emailService");
exports.createNotification = async (req, res) => {
  try {
    const { title, message, target, parentId } = req.body;

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
    });

    if (target === "all" || !target) {
      const parents = await User.find({ role: "parent" });

      for (let p of parents) {
        if (p.email) {
          await sendCredentialsEmail(p.email, title, message);
        }
      }
    }

    if (target === "parent") {
      const parentUser = await User.findById(parentId);

      if (parentUser && parentUser.email) {
        await sendCredentialsEmail(parentUser.email, title, message);
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
    const notifications = await Notification.find()
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

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { title, message },
      { new: true, runValidators: true },
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

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

    const notification = await Notification.findByIdAndDelete(notificationId);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "Notification deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
