const express = require("express");

const router = express.Router();

const { login, getMe, updatePushToken, clearPushToken } = require("../controllers/authController");

const { protect } = require("../middleware/authMiddleware");



router.post("/login", login);

router.get("/me", protect, getMe);

router.put("/push-token", protect, updatePushToken);

router.post("/push-token/clear", protect, clearPushToken);

module.exports = router;