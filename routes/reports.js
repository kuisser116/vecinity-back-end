const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, optionalAuth, checkOwnership } = require('../middleware/auth');
const { uploadReportFiles, processImage, validateFiles, getFileUrl } = require('../middleware/upload');
const Report = require('../models/Report');
const Category = require('../models/Category');
const User = require('../models/User');
const { Op } = require('sequelize');

const router = express.Router();



// @desc    Obtener estadísticas de reportes
// @route   GET /api/reports/stats
// @access  Public
router.get('/stats', asyncHandler(async (req, res) => {
  const stats = await Report.obtenerEstadisticas();

  res.json({
    success: true,
    data: stats
  });
}));

// @desc    Obtener reportes del usuario actual
// @route   GET /api/reports/user/me
// @access  Private
router.get('/user/me', protect, asyncHandler(async (req, res) => {
  const reports = await Report.findAll({
    where: { usuario_id: req.user.id },
    include: [
      {
        model: Category,
        as: 'categoria',
        attributes: ['id', 'nombre', 'color']
      }
    ],
    order: [['created_at', 'DESC']]
  });

  res.json({
    success: true,
    count: reports.length,
    data: reports
  });
}));

// @desc    Obtener todos los reportes (públicos)
// @route   GET /api/reports
// @access  Public
router.get('/', optionalAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número mayor a 0'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
  query('categoria').optional().isInt({ min: 1 }).withMessage('ID de categoría inválido'),
  query('estatus').optional().isIn(['nuevo', 'en_proceso', 'resuelto', 'cerrado']).withMessage('Estatus inválido'),
  query('prioridad').optional().isIn(['baja', 'media', 'alta', 'urgente']).withMessage('Prioridad inválida'),
  query('lat').optional().isFloat().withMessage('Latitud inválida'),
  query('lng').optional().isFloat().withMessage('Longitud inválida'),
  query('radio').optional().isFloat({ min: 0.1, max: 50 }).withMessage('Radio debe estar entre 0.1 y 50 km'),
  query('search').optional().trim().isLength({ min: 2 }).withMessage('La búsqueda debe tener al menos 2 caracteres')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const {
    page = 1,
    limit = 20,
    categoria,
    estatus,
    prioridad,
    lat,
    lng,
    radio = 5,
    search,
    sort = 'created_at'
  } = req.query;

  // Construir filtros
  const whereClause = { is_publico: true };

  if (categoria) whereClause.categoria_id = parseInt(categoria);
  if (estatus) whereClause.estatus = estatus;
  if (prioridad) whereClause.prioridad = prioridad;

  // Búsqueda por texto
  if (search) {
    whereClause[Op.or] = [
      { titulo: { [Op.like]: `%${search}%` } },
      { descripcion: { [Op.like]: `%${search}%` } },
      { direccion: { [Op.like]: `%${search}%` } },
      { folio: { [Op.like]: `%${search}%` } }
    ];
  }

  // Búsqueda por ubicación
  let orderClause = [[sort, 'DESC']];
  if (lat && lng) {
    const latFloat = parseFloat(lat);
    const lngFloat = parseFloat(lng);
    const radioFloat = parseFloat(radio);

    // Filtro inicial por rango aproximado
    whereClause.latitud = {
      [Op.between]: [latFloat - radioFloat * 0.01, latFloat + radioFloat * 0.01]
    };
    whereClause.longitud = {
      [Op.between]: [lngFloat - radioFloat * 0.01, lngFloat + radioFloat * 0.01]
    };

    // Ordenar por distancia
    orderClause = [
      [require('sequelize').literal(`(
        6371 * acos(
          cos(radians(${latFloat})) * cos(radians(latitud)) * 
          cos(radians(longitud) - radians(${lngFloat})) + 
          sin(radians(${latFloat})) * sin(radians(latitud))
        )
      )`), 'ASC']
    ];
  }

  // Paginación
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Construir opciones de consulta
  const queryOptions = {
    where: whereClause,
    include: [
      {
        model: Category,
        as: 'categoria',
        attributes: ['id', 'nombre', 'color', 'icono']
      },
      {
        model: User,
        as: 'usuario',
        attributes: ['id', 'nombre']
      }
    ],
    order: orderClause,
    limit: parseInt(limit),
    offset: offset
  };

  // Atributos base del modelo + distancia si aplica
  if (lat && lng) {
    const latFloat = parseFloat(lat);
    const lngFloat = parseFloat(lng);

    queryOptions.attributes = {
      include: [
        [
          require('sequelize').literal(`(
            6371 * acos(
              cos(radians(${latFloat})) * cos(radians(latitud)) * 
              cos(radians(longitud) - radians(${lngFloat})) + 
              sin(radians(${latFloat})) * sin(radians(latitud))
            )
          )`),
          'distancia'
        ]
      ]
    };
  }

  const { count, rows: reports } = await Report.findAndCountAll(queryOptions);

  // La distancia ya viene calculada desde la base de datos si se enviaron lat/lng

  const processedReports = reports.map(report => {
    let multimediaData = report.multimedia;
    if (typeof multimediaData === 'string') {
      try {
        multimediaData = JSON.parse(multimediaData);
      } catch (e) {
        multimediaData = [];
      }
    }

    const multimedia = (Array.isArray(multimediaData) ? multimediaData : []).map(file => ({
      ...file,
      url: getFileUrl(file.path || file.url, req)
    }));

    return {
      ...report.toJSON(),
      multimedia
    };
  });

  res.json({
    success: true,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / parseInt(limit))
    },
    data: processedReports
  });
}));

// @desc    Crear nuevo reporte
// @route   POST /api/reports
// @access  Private
router.post('/', protect, uploadReportFiles, processImage, [
  body('titulo')
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('El título debe tener entre 5 y 100 caracteres'),
  body('descripcion')
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('La descripción debe tener entre 10 y 1000 caracteres'),
  body('categoria_id')
    .isInt({ min: 1 })
    .withMessage('ID de categoría inválido'),
  body('direccion')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('La dirección debe tener entre 5 y 200 caracteres'),
  body('latitud')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitud inválida'),
  body('longitud')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitud inválida'),
  body('prioridad')
    .optional()
    .isIn(['baja', 'media', 'alta', 'urgente'])
    .withMessage('Prioridad inválida'),
  body('folio')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('El folio no puede tener más de 50 caracteres'),
  body('is_publico')
    .optional()
    .isBoolean()
    .withMessage('El campo público debe ser un valor booleano')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  // Verificar que la categoría existe
  const category = await Category.findByPk(req.body.categoria_id);
  if (!category) {
    return res.status(400).json({
      success: false,
      message: 'Categoría no encontrada'
    });
  }

  // Procesar archivos multimedia
  const multimedia = [];
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      multimedia.push({
        tipo: file.mimetype.startsWith('image/') ? 'imagen' : 'video',
        url: getFileUrl(file.path, req),
        nombre_original: file.originalname,
        tamano: file.size,
        descripcion: ''
      });
    }
  }

  // Crear reporte
  const report = await Report.create({
    titulo: req.body.titulo,
    descripcion: req.body.descripcion,
    categoria_id: req.body.categoria_id,
    direccion: req.body.direccion,
    latitud: req.body.latitud,
    longitud: req.body.longitud,
    prioridad: req.body.prioridad || 'media',
    folio: req.body.folio || null,
    multimedia: multimedia,
    is_publico: req.body.is_publico !== false, // Por defecto público
    usuario_id: req.user.id
  });

  // Obtener reporte con relaciones
  const reportWithRelations = await Report.findByPk(report.id, {
    include: [
      {
        model: Category,
        as: 'categoria',
        attributes: ['id', 'nombre', 'color', 'icono']
      },
      {
        model: User,
        as: 'usuario',
        attributes: ['id', 'nombre']
      }
    ]
  });

  res.status(201).json({
    success: true,
    message: 'Reporte creado correctamente',
    data: reportWithRelations
  });
}));

// @desc    Obtener reporte específico
// @route   GET /api/reports/:id
// @access  Public
router.get('/:id', optionalAuth, asyncHandler(async (req, res) => {
  const report = await Report.findByPk(req.params.id, {
    include: [
      {
        model: Category,
        as: 'categoria',
        attributes: ['id', 'nombre', 'color', 'icono']
      },
      {
        model: User,
        as: 'usuario',
        attributes: ['id', 'nombre']
      }
    ]
  });

  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Reporte no encontrado'
    });
  }

  // Verificar si el usuario puede ver este reporte
  if (!report.is_publico && (!req.user || req.user.id !== report.usuario_id)) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para ver este reporte'
    });
  }

  // Incrementar visitas
  await report.incrementarVisitas();

  res.json({
    success: true,
    data: report
  });
}));

// @desc    Actualizar reporte
// @route   PUT /api/reports/:id
// @access  Private
router.put('/:id', protect, uploadReportFiles, processImage, [
  body('titulo')
    .optional()
    .trim()
    .isLength({ min: 5, max: 100 })
    .withMessage('El título debe tener entre 5 y 100 caracteres'),
  body('descripcion')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 })
    .withMessage('La descripción debe tener entre 10 y 1000 caracteres'),
  body('categoria_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('ID de categoría inválido'),
  body('direccion')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('La dirección debe tener entre 5 y 200 caracteres'),
  body('latitud')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitud inválida'),
  body('longitud')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitud inválida'),
  body('prioridad')
    .optional()
    .isIn(['baja', 'media', 'alta', 'urgente'])
    .withMessage('Prioridad inválida'),
  body('estatus')
    .optional()
    .isIn(['nuevo', 'en_proceso', 'resuelto', 'cerrado'])
    .withMessage('Estatus inválido'),
  body('folio')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('El folio no puede tener más de 50 caracteres'),
  body('is_publico')
    .optional()
    .isBoolean()
    .withMessage('El campo público debe ser un valor booleano')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const report = await Report.findByPk(req.params.id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Reporte no encontrado'
    });
  }

  console.log('=== DEBUG PERMISOS ===');
  console.log('User ID:', req.user.id);
  console.log('Report user ID:', report.usuario_id);
  console.log('User role:', req.user.role);
  console.log('User role type:', typeof req.user.role);
  console.log('Is own report:', report.usuario_id === req.user.id);
  console.log('Has admin role:', ['admin_operativo', 'admin_general', 'superadmin'].includes(req.user.role));


  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  if (report.usuario_id !== req.user.id && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para editar este reporte'
    });
  }

  // Verificar categoría si se está cambiando
  if (req.body.categoria_id) {
    const category = await Category.findByPk(req.body.categoria_id);
    if (!category) {
      return res.status(400).json({
        success: false,
        message: 'Categoría no encontrada'
      });
    }
  }

  // Procesar archivos multimedia si se suben
  if (req.files && req.files.length > 0) {
    const multimedia = [];
    for (const file of req.files) {
      multimedia.push({
        tipo: file.mimetype.startsWith('image/') ? 'imagen' : 'video',
        url: getFileUrl(file.path, req),
        nombre_original: file.originalname,
        tamano: file.size,
        descripcion: ''
      });
    }
    req.body.multimedia = multimedia; // Reemplazar completamente las imágenes existentes
  }

  // Actualizar campos
  const updateFields = ['titulo', 'descripcion', 'categoria_id', 'direccion', 'latitud', 'longitud', 'prioridad', 'estatus', 'folio', 'is_publico', 'multimedia'];
  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      report[field] = req.body[field];
    }
  });

  await report.save();

  // Obtener reporte actualizado con relaciones
  const updatedReport = await Report.findByPk(report.id, {
    include: [
      {
        model: Category,
        as: 'categoria',
        attributes: ['id', 'nombre', 'color', 'icono']
      },
      {
        model: User,
        as: 'usuario',
        attributes: ['id', 'nombre']
      }
    ]
  });

  res.json({
    success: true,
    message: 'Reporte actualizado correctamente',
    data: updatedReport
  });
}));

// @desc    Cambiar estatus de reporte
// @route   PUT /api/reports/:id/status
// @access  Private
router.put('/:id/status', protect, uploadReportFiles, processImage, [
  body('estatus')
    .isIn(['nuevo', 'en_proceso', 'resuelto', 'cerrado'])
    .withMessage('Estatus inválido'),
  body('comentario')
    .optional()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('El comentario debe tener entre 5 y 500 caracteres')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const report = await Report.findByPk(req.params.id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Reporte no encontrado'
    });
  }

  // Verificar permisos
  if (report.usuario_id !== req.user.id && !['admin_operativo', 'admin_general', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para cambiar el estatus de este reporte'
    });
  }

  // Procesar evidencia si se sube
  if (req.files && req.files.length > 0) {
    const evidencia = [];
    for (const file of req.files) {
      evidencia.push({
        tipo: file.mimetype.startsWith('image/') ? 'imagen' : 'video',
        url: getFileUrl(file.path, req),
        nombre_original: file.originalname,
        tamano: file.size,
        descripcion: ''
      });
    }
    req.body.evidencia = evidencia;
  }

  // Cambiar estatus
  await report.cambiarEstatus(req.body.estatus, req.body.comentario, req.body.evidencia);

  res.json({
    success: true,
    message: 'Estatus actualizado correctamente',
    data: report
  });
}));

// @desc    Agregar comentario a reporte
// @route   POST /api/reports/:id/comments
// @access  Private
router.post('/:id/comments', protect, [
  body('comentario')
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('El comentario debe tener entre 5 y 500 caracteres')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const report = await Report.findByPk(req.params.id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Reporte no encontrado'
    });
  }

  // Verificar permisos
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  if (report.usuario_id !== req.user.id && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para comentar en este reporte'
    });
  }

  // Agregar comentario
  await report.agregarComentario({
    usuario_id: req.user.id,
    comentario: req.body.comentario,
    fecha: new Date()
  });

  res.json({
    success: true,
    message: 'Comentario agregado correctamente',
    data: report
  });
}));

// @desc    Votar reporte
// @route   POST /api/reports/:id/vote
// @access  Private
router.post('/:id/vote', protect, [
  body('tipo')
    .isIn(['like', 'dislike'])
    .withMessage('Tipo de voto inválido')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const report = await Report.findByPk(req.params.id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Reporte no encontrado'
    });
  }

  // Verificar permisos
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  if (report.usuario_id !== req.user.id && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para votar en este reporte'
    });
  }

  // Votar
  await report.votar(req.user.id, req.body.tipo);

  res.json({
    success: true,
    message: 'Voto registrado correctamente',
    data: report
  });
}));

// @desc    Eliminar reporte
// @route   DELETE /api/reports/:id
// @access  Private
router.delete('/:id', protect, asyncHandler(async (req, res) => {
  const report = await Report.findByPk(req.params.id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Reporte no encontrado'
    });
  }

  // Verificar permisos
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';
  if (report.usuario_id !== req.user.id && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para eliminar este reporte'
    });
  }

  // Eliminar reporte
  await report.destroy();

  res.json({
    success: true,
    message: 'Reporte eliminado correctamente'
  });
}));


module.exports = router;
