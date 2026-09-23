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

// 5MB is a generous phone photo. Each one is stored as its own document
// (see BoardNoteImage), so the count below is about what a teacher can
// sensibly upload over a school's connection, not about a size limit.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_NOTE = 8;

const createImageUpload = () => {
  // "images" is what the app sends now; "image" is what versions already
  // installed send, and both are accepted so an older phone keeps working
  // against this deploy.
  const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: imageFileFilter,
    limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES_PER_NOTE },
  }).fields([
    { name: "images", maxCount: MAX_IMAGES_PER_NOTE },
    { name: "image", maxCount: 1 },
  ]);

  // Multer reports file-too-large/wrong-type errors to Express's default
  // error handler (an HTML page) unless caught explicitly — wrap it so
  // the mobile app always gets back the same JSON error shape as
  // everything else.
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        let message = "فشل رفع الصور.";
        if (err.code === "LIMIT_FILE_SIZE") {
          message = "حجم الصورة أكبر من المسموح به (5 ميجا).";
        } else if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          message = `أقصى عدد صور في الملاحظة الواحدة ${MAX_IMAGES_PER_NOTE} صور.`;
        }
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
exports.MAX_IMAGES_PER_NOTE = MAX_IMAGES_PER_NOTE;
