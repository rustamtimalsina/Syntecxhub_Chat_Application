const router = require('express').Router();
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { uploadBuffer } = require('../utils/cloudinary');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    // Allow images, common videos, and audio clips
    const valid =
      /^image\/(jpeg|png|webp|gif|svg\+xml)/.test(file.mimetype) ||
      /^video\/(mp4|webm)/.test(file.mimetype) ||
      /^audio\/(webm|mp4|mpeg|ogg|wav|aac|x-m4a|mp3)/.test(file.mimetype);

    if (valid) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Supported formats: Images (JPG, PNG, GIF, WebP), Videos (MP4, WebM), and Audio (WebM, MP3, WAV, OGG, M4A).'
        )
      );
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
