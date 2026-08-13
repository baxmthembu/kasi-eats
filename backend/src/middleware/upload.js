/**
 * File Upload Middleware
 * Multer config for image uploads to Cloudinary
 */
const multer = require('multer');
const {
  MalwareDetectedError,
  MalwareScannerUnavailableError,
  scanBuffer,
} = require('../services/malwareScanner');

// Store files in memory buffer (for Cloudinary stream upload)
const storage = multer.memoryStorage();

// File filter — only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and WebP images are allowed.'), false);
  }
};

const hasValidImageSignature = (file) => {
  const bytes = file?.buffer;
  if (!Buffer.isBuffer(bytes)) return false;

  if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
    return (
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff
    );
  }

  if (file.mimetype === 'image/png') {
    return (
      bytes.length >= 8 &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }

  if (file.mimetype === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
};

const uploadedFiles = (req) => {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    return Object.values(req.files).flat();
  }
  return [];
};

const scanUploadedImages = async (req, res, next) => {
  const files = uploadedFiles(req);

  try {
    for (const file of files) {
      if (!hasValidImageSignature(file)) {
        return res.status(415).json({
          error: 'The uploaded file content does not match a supported image type.',
          code: 'INVALID_IMAGE_CONTENT',
        });
      }

      await scanBuffer(file.buffer);
    }

    return next();
  } catch (error) {
    if (error instanceof MalwareDetectedError) {
      console.warn('[UPLOAD SECURITY] Malware signature detected; upload rejected.');
      return res.status(422).json({
        error: 'The uploaded image failed the security scan. Choose a different file.',
        code: error.code,
      });
    }

    if (error instanceof MalwareScannerUnavailableError) {
      console.error('[UPLOAD SECURITY] Malware scanner unavailable.');
      return res.status(503).json({
        error: 'Image uploads are temporarily unavailable while security scanning recovers.',
        code: error.code,
      });
    }

    return next(error);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

const uploadSingle = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
});

module.exports = {
  hasValidImageSignature,
  scanUploadedImages,
  upload,
  uploadSingle,
  uploadedFiles,
};
