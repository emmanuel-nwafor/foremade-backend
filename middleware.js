const cors = require('cors');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images (JPEG, JPG, PNG, WEBP, GIF) and videos (MP4) are allowed.'));
    }
  },
});

const setupMiddleware = (app) => {
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
  }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));
};

module.exports = { upload, setupMiddleware };