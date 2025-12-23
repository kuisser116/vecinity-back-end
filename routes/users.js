const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, authorize } = require('../middleware/auth');
const { uploadAvatar, processImage, getFileUrl } = require('../middleware/upload');
const User = require('../models/User');
const Report = require('../models/Report');

const router = express.Router();

// @desc    Obtener perfil del usuario actual
// @route   GET /api/users/profile
// @access  Private
router.get('/profile', protect, asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ['password'] },
    include: [
      {
        model: Report,
        as: 'reportes',
        attributes: ['id', 'titulo', 'estatus', 'created_at']
      }
    ]
  });

  res.json({
    success: true,
    data: user
  });
}));

// @desc    Obtener reportes del usuario
// @route   GET /api/users/reports
// @access  Private
router.get('/reports', protect, [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número mayor a 0'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
  query('estatus').optional().isIn(['nuevo', 'en_proceso', 'resuelto', 'cerrado']).withMessage('Estatus inválido')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { page = 1, limit = 20, estatus } = req.query;

  // Construir filtros
  const whereClause = { usuario_id: req.user.id };
  if (estatus) whereClause.estatus = estatus;

  const { count, rows: reports } = await Report.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: require('../models/Category'),
        as: 'categoria',
        attributes: ['id', 'nombre', 'color']
      }
    ],
    order: [['created_at', 'DESC']],
    offset: (parseInt(page) - 1) * parseInt(limit),
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    count: reports.length,
    total: count,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(count / parseInt(limit))
    },
    data: reports
  });
}));

// @desc    Obtener estadísticas del usuario
// @route   GET /api/users/stats
// @access  Private
router.get('/stats', protect, asyncHandler(async (req, res) => {
  const stats = await Report.findAll({
    where: { usuario_id: req.user.id },
    attributes: [
      'estatus',
      [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
    ],
    group: ['estatus']
  });

  const totalReports = await Report.count({ where: { usuario_id: req.user.id } });
  const recentReports = await Report.count({
    where: {
      usuario_id: req.user.id,
      created_at: {
        [require('sequelize').Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    }
  });

  const statsObject = {
    total: totalReports,
    recientes: recentReports,
    por_estatus: {}
  };

  stats.forEach(stat => {
    statsObject.por_estatus[stat.estatus] = parseInt(stat.getDataValue('count'));
  });

  res.json({
    success: true,
    data: statsObject
  });
}));

// @desc    Obtener estadísticas administrativas
// @route   GET /api/users/stats/admin
// @access  Private (Admin)
router.get('/stats/admin', protect, authorize('admin_general', 'superadmin'), asyncHandler(async (req, res) => {
  const totalUsers = await User.count();
  const activeUsers = await User.count({ where: { is_active: true } });
  const verifiedUsers = await User.count({ where: { is_verified: true } });

  const usersByRole = await User.findAll({
    attributes: [
      'roles',
      [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
    ],
    group: ['roles']
  });

  const roleStats = {};
  usersByRole.forEach(stat => {
    const roles = stat.roles || ['usuario'];
    roles.forEach(role => {
      roleStats[role] = (roleStats[role] || 0) + parseInt(stat.getDataValue('count'));
    });
  });

  const recentUsers = await User.count({
    where: {
      created_at: {
        [require('sequelize').Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      }
    }
  });

  res.json({
    success: true,
    data: {
      total: totalUsers,
      activos: activeUsers,
      verificados: verifiedUsers,
      recientes: recentUsers,
      por_rol: roleStats
    }
  });
}));

// @desc    Obtener todos los usuarios (Admin)
// @route   GET /api/users
// @access  Private (Admin)
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número mayor a 0'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('El límite debe estar entre 1 y 100'),
  query('search').optional().trim().isLength({ min: 2 }).withMessage('La búsqueda debe tener al menos 2 caracteres'),
  query('role').optional().isIn(['usuario', 'admin_operativo', 'admin_general', 'superadmin']).withMessage('Rol inválido'),
  query('is_active').optional().isBoolean().withMessage('Estado activo inválido'),
  query('is_verified').optional().isBoolean().withMessage('Estado verificado inválido')
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
    search,
    role,
    is_active,
    is_verified,
    sort = 'created_at'
  } = req.query;

  // Construir filtros
  const whereClause = {};
  if (search) {
    whereClause[require('sequelize').Op.or] = [
      { nombre: { [require('sequelize').Op.like]: `%${search}%` } },

      { email: { [require('sequelize').Op.like]: `%${search}%` } },
      { telefono: { [require('sequelize').Op.like]: `%${search}%` } }
    ];
  }
  if (role) whereClause.roles = { [require('sequelize').Op.like]: `%${role}%` };
  if (is_active !== undefined) whereClause.is_active = is_active;
  if (is_verified !== undefined) whereClause.is_verified = is_verified;

  // Ordenamiento
  let orderClause = [[sort, 'DESC']];
  if (sort === 'nombre') {
    orderClause = [['nombre', 'ASC']];
  }

  const { count, rows: users } = await User.findAndCountAll({
    where: whereClause,
    attributes: { exclude: ['password'] },
    include: [
      {
        model: Report,
        as: 'reportes',
        attributes: ['id', 'titulo', 'estatus', 'created_at']
      }
    ],
    order: orderClause,
    offset: (parseInt(page) - 1) * parseInt(limit),
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / parseInt(limit))
    },
    data: users
  });
}));

// @desc    Actualizar perfil del usuario
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', protect, uploadAvatar, [
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),

  body('telefono')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Número de teléfono inválido'),
  body('direccion')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('La dirección debe tener entre 5 y 200 caracteres'),
  body('whatsapp')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Número de WhatsApp inválido')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const user = await User.findByPk(req.user.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Usuario no encontrado'
    });
  }

  // Procesar avatar si se sube
  if (req.file) {
    const processedFile = await processImage(req.file);
    user.avatar = getFileUrl(processedFile.filename);
  }

  // Actualizar campos
  const updateFields = ['nombre', 'telefono', 'direccion', 'whatsapp'];
  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  await user.save();

  // Obtener usuario actualizado sin contraseña
  const updatedUser = await User.findByPk(user.id, {
    attributes: { exclude: ['password'] }
  });

  res.json({
    success: true,
    message: 'Perfil actualizado correctamente',
    data: updatedUser
  });
}));

// @desc    Cambiar contraseña
// @route   PUT /api/users/password
// @access  Private
router.put('/password', protect, [
  body('currentPassword')
    .notEmpty()
    .withMessage('La contraseña actual es requerida'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('La nueva contraseña debe tener al menos 6 caracteres')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const user = await User.findByPk(req.user.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Usuario no encontrado'
    });
  }

  const { currentPassword, newPassword } = req.body;

  // Verificar contraseña actual
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: 'Contraseña actual incorrecta'
    });
  }

  // Actualizar contraseña
  user.password = newPassword;
  await user.save();

  res.json({
    success: true,
    message: 'Contraseña actualizada correctamente'
  });
}));

// @desc    Obtener usuario específico (Admin)
// @route   GET /api/users/:id
// @access  Private (Admin)
router.get('/:id', protect, authorize('admin_general', 'superadmin'), asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id, {
    attributes: { exclude: ['password'] },
    include: [
      {
        model: Report,
        as: 'reportes',
        attributes: ['id', 'titulo', 'estatus', 'created_at']
      }
    ]
  });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Usuario no encontrado'
    });
  }

  res.json({
    success: true,
    data: user
  });
}));

// @desc    Actualizar usuario (Admin)
// @route   PUT /api/users/:id
// @access  Private (Admin)
router.put('/:id', protect, authorize('admin_general', 'superadmin'), [
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),

  body('email')
    .optional()
    .isEmail()
    .withMessage('Email inválido'),
  body('telefono')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Número de teléfono inválido'),
  body('direccion')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('La dirección debe tener entre 5 y 200 caracteres'),
  body('whatsapp')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Número de WhatsApp inválido'),
  body('roles')
    .optional()
    .isArray()
    .withMessage('Los roles deben ser un array'),
  body('roles.*')
    .optional()
    .isIn(['usuario', 'admin_operativo', 'admin_general', 'superadmin'])
    .withMessage('Rol inválido'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('El estado activo debe ser un valor booleano'),
  body('is_verified')
    .optional()
    .isBoolean()
    .withMessage('El estado verificado debe ser un valor booleano')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Usuario no encontrado'
    });
  }

  // Verificar email único si se está cambiando
  if (req.body.email && req.body.email !== user.email) {
    const existingUser = await User.findOne({
      where: { email: req.body.email }
    });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe un usuario con ese email'
      });
    }
  }

  // Actualizar campos
  const updateFields = ['nombre', 'email', 'telefono', 'direccion', 'whatsapp', 'roles', 'is_active', 'is_verified'];
  updateFields.forEach(field => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  await user.save();

  // Obtener usuario actualizado sin contraseña
  const updatedUser = await User.findByPk(user.id, {
    attributes: { exclude: ['password'] }
  });

  res.json({
    success: true,
    message: 'Usuario actualizado correctamente',
    data: updatedUser
  });
}));

// @desc    Eliminar usuario (Admin)
// @route   DELETE /api/users/:id
// @access  Private (Admin)
router.delete('/:id', protect, authorize('admin_general', 'superadmin'), asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Usuario no encontrado'
    });
  }

  // Verificar que no se elimine a sí mismo
  if (user.id === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'No puedes eliminar tu propia cuenta'
    });
  }

  // Verificar que no se elimine al superadmin
  if (user.roles.includes('superadmin')) {
    return res.status(400).json({
      success: false,
      message: 'No se puede eliminar un superadministrador'
    });
  }

  // Verificar si hay reportes asociados
  const reportCount = await Report.count({
    where: { usuario_id: req.params.id }
  });

  if (reportCount > 0) {
    return res.status(400).json({
      success: false,
      message: `No se puede eliminar el usuario porque tiene ${reportCount} reportes asociados`
    });
  }

  // Eliminar usuario
  await user.destroy();

  res.json({
    success: true,
    message: 'Usuario eliminado correctamente'
  });
}));

module.exports = router; 