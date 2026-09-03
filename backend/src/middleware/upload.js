const fs = require("fs");
const path = require("path");
const multer = require("multer");

// Local disk storage — no cloud storage provider is configured for this
// project yet, so uploaded photos live under backend/uploads/<subfolder>
// and are served back via express.static (see app.js). Moving to a cloud
// provider later only means swapping this file's storage engine —
// nothing else references the disk path directly.
const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");

const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("الملف المرفوع لازم يكون صورة."));
  }
  cb(null, true);
};

// Builds a single-image-upload middleware scoped to its own subfolder
// (e.g. "board-notes") — every feature that accepts a photo gets its own
// call to this instead of sharing one giant uploads directory.
const createImageUpload = (subfolder) => {
  const dir = path.join(UPLOADS_ROOT, subfolder);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
    },
  });

  // 8MB is generous for a phone-camera photo while still keeping the
  // server's disk usage sane.
  const upload = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 8 * 1024 * 1024 },
  }).single("image");

  // Multer reports file-too-large/wrong-type errors to Express's default
  // error handler (an HTML page) unless caught explicitly — wrap it so
  // the mobile app always gets back the same JSON error shape as
  // everything else.
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? "حجم الصورة أكبر من المسموح به (8 ميجا)."
            : "فشل رفع الصورة.";
        return res.status(400).json({ success: false, message });
      }
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  };
};

exports.uploadBoardNoteImage = createImageUpload("board-notes");
