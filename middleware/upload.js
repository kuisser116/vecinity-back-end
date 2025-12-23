const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    
    // Crear directorio si no existe
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    // Crear subdirectorios por tipo
    const subDir = file.fieldname === 'avatar' ? 'avatars' : 'reports';
    const fullPath = path.join(uploadPath, subDir);
    
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
    
    cb(null, fullPath);
  },
  filename: (req, file, cb) => {
    // Generar nombre único para el archivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// Filtro de archivos
const fileFilter = (req, file, cb) => {
  // Tipos de archivo permitidos
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv'];
  const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, WebP) y videos (MP4, AVI, MOV, WMV)'), false);
  }
};

// Configuración de multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB por defecto
    files: 10 // Máximo 10 archivos
  }
});

// Middleware para procesar imágenes
const processImage = async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next();
  }

  try {
    const processedFiles = [];

    for (const file of req.files) {
      if (file.mimetype.startsWith('image/')) {
        // Procesar imagen con Sharp
        const processedPath = await sharp(file.path)
          .resize(1200, 1200, { 
            fit: 'inside', 
            withoutEnlargement: true 
          })
          .jpeg({ quality: 80 })
          .toFile(file.path + '_processed');

        // Reemplazar archivo original con el procesado
        fs.unlinkSync(file.path);
        fs.renameSync(file.path + '_processed', file.path);

        // Crear thumbnail
        const thumbnailPath = file.path.replace(path.extname(file.path), '_thumb' + path.extname(file.path));
        await sharp(file.path)
          .resize(300, 300, { 
            fit: 'cover' 
          })
          .jpeg({ quality: 70 })
          .toFile(thumbnailPath);

        processedFiles.push({
          ...file,
          thumbnail: thumbnailPath.replace(process.env.UPLOAD_PATH || './uploads', '')
        });
      } else {
        processedFiles.push(file);
      }
    }

    req.files = processedFiles;
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware para validar archivos
const validateFiles = (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Debes subir al menos un archivo'
    });
  }

  // Validar número máximo de archivos
  const maxFiles = req.body.maxFiles || 10;
  if (req.files.length > maxFiles) {
    return res.status(400).json({
      success: false,
      message: `Máximo ${maxFiles} archivos permitidos`
    });
  }

  // Validar tamaño total de archivos
  const maxTotalSize = parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024; // 50MB
  const totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
  
  if (totalSize > maxTotalSize) {
    return res.status(400).json({
      success: false,
      message: 'El tamaño total de los archivos excede el límite permitido'
    });
  }

  next();
};

// Middleware para limpiar archivos en caso de error
const cleanupFiles = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400 && req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        if (file.thumbnail && fs.existsSync(file.thumbnail)) {
          fs.unlinkSync(file.thumbnail);
        }
      });
    }
  });
  next();
};

// Configuraciones específicas para diferentes tipos de upload
const uploadAvatar = upload.single('avatar');
const uploadReportFiles = upload.array('files', 10);
const uploadMultiple = upload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'videos', maxCount: 3 }
]);

// Función para eliminar archivo
const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
};

// Función para obtener URL del archivo
const getFileUrl = (filePath, req) => {
  if (!filePath) return null;

  const baseUrl = `${req.protocol}://${req.get('host')}`;

  // Normalizar los slashes
  let normalizedPath = filePath.replace(/\\/g, '/');

  // Si el path contiene 'uploads', tomar solo la parte después de 'uploads/'
  const uploadsIndex = normalizedPath.indexOf('uploads/');
  if (uploadsIndex >= 0) {
    normalizedPath = normalizedPath.substring(uploadsIndex + 'uploads/'.length);
  }

  return `${baseUrl}/uploads/${normalizedPath}`;
};


module.exports = {
  upload,
  uploadAvatar,
  uploadReportFiles,
  uploadMultiple,
  processImage,
  validateFiles,
  cleanupFiles,
  deleteFile,
  getFileUrl
}; 