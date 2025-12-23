const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, authorize } = require('../middleware/auth');
const User = require('../models/User');
const Report = require('../models/Report');
const Category = require('../models/Category');

const router = express.Router();

// @desc    Dashboard administrativo
// @route   GET /api/admin/dashboard
// @access  Private (Admin)
router.get('/dashboard', protect, authorize('admin_operativo', 'admin_general', 'superadmin'), asyncHandler(async (req, res) => {
  // Estadísticas de reportes
  const reportStats = await Report.findAll({
    attributes: [
      'estatus',
      [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
    ],
    group: ['estatus']
  });

  const totalReports = await Report.count();
  const recentReports = await Report.count({
    where: {
      created_at: {
        [require('sequelize').Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    }
  });

  // Estadísticas de usuarios
  const userStats = await User.findAll({
    attributes: [
      'roles',
      [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
    ],
    group: ['roles']
  });

  const totalUsers = await User.count();
  const activeUsers = await User.count({ where: { is_active: true } });

  // Estadísticas de categorías
  const totalCategories = await Category.count({ where: { is_active: true } });

  // Reportes recientes
  const recentReportsList = await Report.findAll({
    include: [
      {
        model: User,
        as: 'usuario',
        attributes: ['id', 'nombre']
      },
      {
        model: Category,
        as: 'categoria',
        attributes: ['id', 'nombre', 'color']
      }
    ],
    order: [['created_at', 'DESC']],
    limit: 10
  });

  // Usuarios recientes
  const recentUsers = await User.findAll({
    attributes: { exclude: ['password'] },
    order: [['created_at', 'DESC']],
    limit: 10
  });

  const dashboard = {
    reportes: {
      total: totalReports,
      recientes: recentReports,
      por_estatus: {}
    },
    usuarios: {
      total: totalUsers,
      activos: activeUsers,
      por_rol: {}
    },
    categorias: {
      total: totalCategories
    },
    reportes_recientes: recentReportsList,
    usuarios_recientes: recentUsers
  };

  reportStats.forEach(stat => {
    dashboard.reportes.por_estatus[stat.estatus] = parseInt(stat.getDataValue('count'));
  });

  userStats.forEach(stat => {
    const roles = stat.roles || ['usuario'];
    roles.forEach(role => {
      dashboard.usuarios.por_rol[role] = (dashboard.usuarios.por_rol[role] || 0) + parseInt(stat.getDataValue('count'));
    });
  });

  res.json({
    success: true,
    data: dashboard
  });
}));

// @desc    Obtener reportes asignados
// @route   GET /api/admin/reports/assigned
// @access  Private (Admin)
router.get('/reports/assigned', protect, authorize('admin_operativo', 'admin_general', 'superadmin'), asyncHandler(async (req, res) => {
  const reports = await Report.findAll({
    where: {
      asignado_a: req.user.id
    },
    include: [
      {
        model: User,
        as: 'usuario',
        attributes: ['id', 'nombre']
      },
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

// @desc    Obtener logs del sistema
// @route   GET /api/admin/logs
// @access  Private (Superadmin)
router.get('/logs', protect, authorize('superadmin'), asyncHandler(async (req, res) => {
  // TODO: Implementar sistema de logs
  res.json({
    success: true,
    message: 'Sistema de logs en desarrollo',
    data: []
  });
}));

// @desc    Obtener configuración del sistema
// @route   GET /api/admin/config
// @access  Private (Superadmin)
router.get('/config', protect, authorize('superadmin'), asyncHandler(async (req, res) => {
  // TODO: Implementar configuración del sistema
  res.json({
    success: true,
    message: 'Configuración del sistema en desarrollo',
    data: {}
  });
}));

// @desc    Obtener estadísticas de usuarios
// @route   GET /api/admin/users/stats
// @access  Private (Admin)
router.get('/users/stats', protect, authorize('admin_general', 'superadmin'), asyncHandler(async (req, res) => {
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

// @desc    Actualizar configuración del sistema
// @route   PUT /api/admin/config
// @access  Private (Superadmin)
router.put('/config', protect, authorize('superadmin'), [
  body('configuracion')
    .isObject()
    .withMessage('La configuración debe ser un objeto')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  // TODO: Implementar actualización de configuración
  res.json({
    success: true,
    message: 'Configuración actualizada correctamente',
    data: req.body.configuracion
  });
}));

// @desc    Crear backup de la base de datos
// @route   POST /api/admin/backup
// @access  Private (Superadmin)
router.post('/backup', protect, authorize('superadmin'), asyncHandler(async (req, res) => {
  // TODO: Implementar sistema de backup
  res.json({
    success: true,
    message: 'Sistema de backup en desarrollo',
    data: {
      fecha: new Date(),
      estado: 'pendiente'
    }
  });
}));

// @desc    Restaurar backup de la base de datos
// @route   POST /api/admin/restore
// @access  Private (Superadmin)
router.post('/restore', protect, authorize('superadmin'), [
  body('backup_id')
    .notEmpty()
    .withMessage('ID de backup requerido')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  // TODO: Implementar sistema de restauración
  res.json({
    success: true,
    message: 'Sistema de restauración en desarrollo',
    data: {
      backup_id: req.body.backup_id,
      estado: 'pendiente'
    }
  });
}));

// @desc    Moderar reporte
// @route   PUT /api/admin/reports/:id/moderate
// @access  Private (Admin)
router.put('/reports/:id/moderate', protect, authorize('admin_operativo', 'admin_general', 'superadmin'), [
  body('accion')
    .isIn(['aprobar', 'rechazar', 'editar', 'eliminar'])
    .withMessage('Acción inválida'),
  body('razon')
    .optional()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('La razón debe tener entre 5 y 500 caracteres'),
  body('cambios')
    .optional()
    .isObject()
    .withMessage('Los cambios deben ser un objeto')
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

  const { accion, razon, cambios } = req.body;

  switch (accion) {
    case 'aprobar':
      report.is_publico = true;
      break;
    case 'rechazar':
      report.is_publico = false;
      break;
    case 'editar':
      if (cambios) {
        Object.keys(cambios).forEach(key => {
          if (report[key] !== undefined) {
            report[key] = cambios[key];
          }
        });
      }
      break;
    case 'eliminar':
      await report.destroy();
      return res.json({
        success: true,
        message: 'Reporte eliminado correctamente'
      });
    default:
      return res.status(400).json({
        success: false,
        message: 'Acción no válida'
      });
  }

  // Agregar comentario de moderación
  if (razon) {
    await report.agregarComentario({
      usuario_id: req.user.id,
      comentario: `[MODERACIÓN] ${razon}`,
      fecha: new Date()
    });
  }

  await report.save();

  res.json({
    success: true,
    message: 'Reporte moderado correctamente',
    data: report
  });
}));

// @desc    Asignar reporte
// @route   PUT /api/admin/reports/:id/assign
// @access  Private (Admin)
router.put('/reports/:id/assign', protect, authorize('admin_operativo', 'admin_general', 'superadmin'), [
  body('asignado_a')
    .isInt({ min: 1 })
    .withMessage('ID de usuario asignado inválido')
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

  // Verificar que el usuario asignado existe y es admin
  const assignedUser = await User.findByPk(req.body.asignado_a);
  if (!assignedUser) {
    return res.status(404).json({
      success: false,
      message: 'Usuario asignado no encontrado'
    });
  }

  if (!assignedUser.roles.includes('admin')) {
    return res.status(400).json({
      success: false,
      message: 'Solo se pueden asignar reportes a administradores'
    });
  }

  report.asignado_a = req.body.asignado_a;
  await report.save();

  res.json({
    success: true,
    message: 'Reporte asignado correctamente',
    data: report
  });
}));

// @desc    Eliminar reporte
// @route   DELETE /api/admin/reports/:id
// @access  Private (Admin)
router.delete('/reports/:id', protect, authorize('admin_general', 'superadmin'), asyncHandler(async (req, res) => {
  const report = await Report.findByPk(req.params.id);
  if (!report) {
    return res.status(404).json({
      success: false,
      message: 'Reporte no encontrado'
    });
  }

  await report.destroy();

  res.json({
    success: true,
    message: 'Reporte eliminado correctamente'
  });
}));

// @desc    Cambiar rol de usuario
// @route   PUT /api/admin/users/:id/role
// @access  Private (Superadmin)
router.put('/users/:id/role', protect, authorize('superadmin'), [
  body('roles')
    .isArray()
    .withMessage('Los roles deben ser un array'),
  body('roles.*')
    .isIn(['usuario', 'admin_operativo', 'admin_general', 'superadmin'])
    .withMessage('Rol inválido')
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

  // Verificar que no se cambie el rol de sí mismo
  if (user.id === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'No puedes cambiar tu propio rol'
    });
  }

  user.roles = req.body.roles;
  await user.save();

  res.json({
    success: true,
    message: 'Rol de usuario actualizado correctamente',
    data: {
      id: user.id,
      roles: user.roles
    }
  });
}));

module.exports = router; 