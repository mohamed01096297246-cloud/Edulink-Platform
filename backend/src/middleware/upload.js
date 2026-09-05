const multer = require("multer");

// Uploads are held in memory and then written into MongoDB by the
// controller — never to the container's disk. App Platform containers are
// ephemeral and more than one runs at a time, so a file saved to disk is
// erased by the next deploy and invisible to the sibling instance.
const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("الملف المرفوع لازم يكون صورة."));
  }
  cb(null, true);
};

// 5MB keeps a phone photo comfortably within a single MongoDB document
// (16MB hard limit) with room to spare for the rest of the document.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const createImageUpload = () => {
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: imageFileFilter,
    limits: { fileSize: MAX_IMAGE_BYTES },
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
            ? "حجم الصورة أكبر من المسموح به (5 ميجا)."
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

exports.uploadBoardNoteImage = createImageUpload();
