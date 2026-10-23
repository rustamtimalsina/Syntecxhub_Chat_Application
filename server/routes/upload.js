const router = require('express').Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { uploadBuffer } = require('../utils/cloudinary');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    // Allow images and common media formats
    if (/^image\/(jpeg|png|webp|gif|svg\+xml)|video\/mp4/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images (JPG, PNG, GIF, WebP, SVG) and MP4 videos are allowed.'));
    }
  },
});

router.post('/', protect, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file provided' });
    }

    try {
      const result = await uploadBuffer(req.file.buffer, {
        filename_override: req.file.originalname,
      });

      res.json({
        url: result.url,
        publicId: result.publicId,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        size: req.file.size,
      });
    } catch (uploadErr) {
      res.status(500).json({ message: uploadErr.message || 'File upload failed' });
    }
  });
});

module.exports = router;
