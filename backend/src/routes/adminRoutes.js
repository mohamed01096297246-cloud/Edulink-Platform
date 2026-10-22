const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { protect, authorize, requireSuperAdmin } = require("../middleware/authMiddleware");

router.use(protect, authorize("admin"));

router.get("/dashboard", adminController.getAdminDashboard);
router.get("/users", adminController.getAllUsers);
router.put("/users/students-app-access", requireSuperAdmin, adminController.setStudentsAppAccess);
router.get("/user/:id", adminController.getUserById);


router.post("/sub-admin", adminController.protectAdminActions, adminController.createSubAdmin);
router.put("/user/:id", adminController.protectAdminActions, adminController.updateUser);
router.delete("/user/:id", adminController.protectAdminActions, adminController.deleteUser);

module.exports = router;