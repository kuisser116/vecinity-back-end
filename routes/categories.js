const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect, authorize } = require('../middleware/auth');
const Category = require('../models/Category');
const Report = require('../models/Report');

const router = express.Router();

// @desc    Obtener estadísticas de categorías
// @route   GET /api/categories/stats
// @access  Public
router.get('/stats', asyncHandler(async (req, res) => {
  const categories = await Category.findAll({
    where: { is_active: true },
    include: [
      {
        model: Report,
        as: 'reportes',
        attributes: []
      }
    ],
    attributes: [
      'id',
      'nombre',
      'color',
      'icono',
      [require('sequelize').fn('COUNT', require('sequelize').col('reportes.id')), 'total_reports']
    ],
    group: ['Category.id'],
    order: [['orden', 'ASC']]
  });

  const stats = categories.map(category => ({
    id: category.id,
    nombre: category.nombre,
    color: category.color,
    icono: category.icono,
    total_reports: parseInt(category.getDataValue('total_reports'))
  }));

  res.json({
    success: true,
    data: stats
  });
}));

// @desc    Obtener todas las categorías activas
// @route   GET /api/categories
// @access  Public
router.get('/', asyncHandler(async (req, res) => {
  const categories = await Category.getActiveCategories();

  res.json({
    success: true,
    count: categories.length,
    data: categories
  });
}));

// @desc    Crear nueva categoría
// @route   POST /api/categories
// @access  Public
router.post('/', [
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('descripcion')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('La descripción debe tener entre 5 y 200 caracteres'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('El color debe ser un código hexadecimal válido'),
  body('icono')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('El icono debe tener entre 1 y 50 caracteres'),
  body('orden')
    .optional()
    .isInt({ min: 0 })
    .withMessage('El orden debe ser un número entero mayor o igual a 0'),
  body('subcategorias')
    .optional()
    .isArray()
    .withMessage('Las subcategorías deben ser un array'),
  body('subcategorias.*.nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Cada subcategoría debe tener un nombre entre 2 y 50 caracteres')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { nombre, descripcion, color, icono, orden, subcategorias } = req.body;

  // Verificar si ya existe una categoría con ese nombre
  const existingCategory = await Category.findOne({
    where: { nombre: nombre.toLowerCase() }
  });

  if (existingCategory) {
    return res.status(400).json({
      success: false,
      message: 'Ya existe una categoría con ese nombre'
    });
  }

  // Crear categoría
  const category = await Category.create({
    nombre: nombre.toLowerCase(),
    descripcion,
    color: color || '#3B82F6',
    icono: icono || 'default-icon',
    orden: orden || 0,
    subcategorias: subcategorias || [],
    created_by: null  // ya no depende de req.user
  });

  res.status(201).json({
    success: true,
    message: 'Categoría creada correctamente',
    data: category
  });
}));


// @desc    Agregar subcategoría
// @route   POST /api/categories/:id/subcategories
// @access  Private (Admin)
router.post('/:id/subcategories', [
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('descripcion')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La descripción no puede tener más de 200 caracteres'),
  body('icono')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('El icono debe tener entre 1 y 50 caracteres')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const category = await Category.findByPk(req.params.id);
  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Categoría no encontrada'
    });
  }

  const { nombre, descripcion, icono } = req.body;

  // Verificar si la subcategoría ya existe
  if (category.hasSubcategory(nombre)) {
    return res.status(400).json({
      success: false,
      message: 'Ya existe una subcategoría con ese nombre'
    });
  }

  // Agregar subcategoría
  await category.addSubcategory({
    nombre,
    descripcion: descripcion || '',
    icono: icono || 'default-sub-icon'
  });

  res.json({
    success: true,
    message: 'Subcategoría agregada correctamente',
    data: category
  });
}));


// @desc    Eliminar categoría
// @route   DELETE /api/categories/:id
// @access  Private (Admin)
router.delete('/:id', asyncHandler(async (req, res) => {
  const category = await Category.findByPk(req.params.id);
  if (!category) {
    return res.status(404).json({ success: false, message: 'Categoría no encontrada' });
  }

  // Verificar si hay reportes usando esta categoría
  const reportCount = await Report.count({
    where: { categoria_id: req.params.id }
  });

  if (reportCount > 0) {
    return res.status(400).json({
      success: false,
      message: `No se puede eliminar la categoría porque tiene ${reportCount} reportes asociados`
    });
  }

  await category.destroy();

  res.json({
    success: true,
    message: 'Categoría eliminada correctamente'
  });
}));



// @desc    Eliminar subcategoría
// @route   DELETE /api/categories/:id/subcategories/:name
// @access  Private (Admin)
router.delete('/:id/subcategories/:name', asyncHandler(async (req, res) => {
  const category = await Category.findByPk(req.params.id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Categoría no encontrada'
    });
  }

  const subcategoryName = decodeURIComponent(req.params.name);

  // Validación segura aunque no haya subcategorías
  if (!category.hasSubcategory(subcategoryName)) {
    return res.status(404).json({
      success: false,
      message: 'Subcategoría no encontrada o no hay subcategorías'
    });
  }

  // Verificar si hay reportes usando esta subcategoría
  const reportCount = await Report.count({
    where: {
      categoria_id: req.params.id,
      subcategoria: subcategoryName
    }
  });

  if (reportCount > 0) {
    return res.status(400).json({
      success: false,
      message: `No se puede eliminar la subcategoría porque tiene ${reportCount} reportes asociados`
    });
  }

  // Eliminar subcategoría
  await category.removeSubcategory(subcategoryName);

  res.json({
    success: true,
    message: 'Subcategoría eliminada correctamente',
    data: category
  });
}));


// @desc    Obtener categoría específica
// @route   GET /api/categories/:id
// @access  Public
router.get('/:id', asyncHandler(async (req, res) => {
  const category = await Category.getCategoryWithSubcategories(req.params.id);

  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Categoría no encontrada'
    });
  }

  res.json({
    success: true,
    data: category
  });
}));

// @desc    Actualizar categoría
// @route   PUT /api/categories/:id
// @access  Private (Admin)
router.put('/:id', protect, authorize('admin_general', 'superadmin'), [
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('descripcion')
    .optional()
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('La descripción debe tener entre 5 y 200 caracteres'),
  body('color')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('El color debe ser un código hexadecimal válido'),
  body('icono')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('El icono debe tener entre 1 y 50 caracteres'),
  body('orden')
    .optional()
    .isInt({ min: 0 })
    .withMessage('El orden debe ser un número entero mayor o igual a 0'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('El estado activo debe ser un valor booleano')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const category = await Category.findByPk(req.params.id);
  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Categoría no encontrada'
    });
  }

  const { nombre, descripcion, color, icono, orden, is_active } = req.body;

  // Verificar si el nuevo nombre ya existe en otra categoría
  if (nombre && nombre.toLowerCase() !== category.nombre) {
    const existingCategory = await Category.findOne({
      where: { 
        nombre: nombre.toLowerCase(),
        id: { [require('sequelize').Op.ne]: req.params.id }
      }
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Ya existe una categoría con ese nombre'
      });
    }
  }

  // Actualizar campos
  if (nombre) category.nombre = nombre.toLowerCase();
  if (descripcion !== undefined) category.descripcion = descripcion;
  if (color) category.color = color;
  if (icono) category.icono = icono;
  if (orden !== undefined) category.orden = orden;
  if (is_active !== undefined) category.is_active = is_active;
  
  category.updated_by = req.user.id;
  await category.save();

  res.json({
    success: true,
    message: 'Categoría actualizada correctamente',
    data: category
  });
}));

// @desc    Eliminar categoría
// @route   DELETE /api/categories/:id
// @access  Private (Admin)
router.delete('/:id', protect, authorize('admin_general', 'superadmin'), asyncHandler(async (req, res) => {
  const category = await Category.findByPk(req.params.id);
  if (!category) {
    return res.status(404).json({
      success: false,
      message: 'Categoría no encontrada'
    });
  }

  // Verificar si hay reportes usando esta categoría
  const reportCount = await Report.count({
    where: { categoria_id: req.params.id }
  });

  if (reportCount > 0) {
    return res.status(400).json({
      success: false,
      message: `No se puede eliminar la categoría porque tiene ${reportCount} reportes asociados`
    });
  }

  // Eliminar categoría
  await category.destroy();

  res.json({
    success: true,
    message: 'Categoría eliminada correctamente'
  });
}));

module.exports = router; 