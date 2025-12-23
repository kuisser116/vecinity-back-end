const express = require('express');
const { body, validationResult } = require('express-validator');
const { asyncHandler } = require('../middleware/errorHandler');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// @desc    Registrar usuario
// @route   POST /api/auth/register
// @access  Public
router.post('/register', [
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('calle')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('La calle debe tener entre 2 y 100 caracteres'),
  body('numero')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('El número debe tener entre 1 y 10 caracteres'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Ingresa un email válido'),
  body('whatsapp')
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Ingresa un número de WhatsApp válido'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { nombre, calle, numero, email, whatsapp, password } = req.body;

  // Verificar si el usuario ya existe
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'El email ya está registrado'
    });
  }

  // Crear usuario
  const user = await User.create({
    nombre,
    calle,
    numero,
    email,
    whatsapp,
    password
  });

  // Generar token
  const token = user.getSignedJwtToken();

  res.status(201).json({
    success: true,
    token,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role,
      is_verified: user.is_verified
    }
  });
}));

// @desc    Registrar administrador (rol siempre admin_general)
// @route   POST /api/auth/register-admin
// @access  Private (solo superadmin)
router.post('/register-admin', protect, [
  body('nombre')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('calle')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('La calle debe tener entre 2 y 100 caracteres'),
  body('numero')
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('El número debe tener entre 1 y 10 caracteres'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Ingresa un email válido'),
  body('whatsapp')
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Ingresa un número de WhatsApp válido'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
], asyncHandler(async (req, res) => {
  // Solo superadmin puede registrar administradores
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({
      success: false,
      message: 'No tienes permisos para registrar administradores'
    });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { nombre, calle, numero, email, whatsapp, password } = req.body;

  // Verificar si el usuario ya existe
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: 'El email ya está registrado'
    });
  }

  // Crear usuario con rol fijo admin_general
  const user = await User.create({
    nombre,
    calle,
    numero,
    email,
    whatsapp,
    password,
    role: 'admin_general'
  });

  res.status(201).json({
    success: true,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role,
      is_verified: user.is_verified
    }
  });
}));


// @desc    Iniciar sesión
// @route   POST /api/auth/login
// @access  Public
router.post('/login', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Ingresa un email válido'),
  body('password')
    .exists()
    .withMessage('La contraseña es requerida')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Verificar si el usuario existe
  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.status(401).json({
      success: false,
      message: 'Credenciales inválidas'
    });
  }

  // Verificar contraseña
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Credenciales inválidas'
    });
  }

  // Verificar si el usuario está activo
  if (!user.is_active) {
    return res.status(401).json({
      success: false,
      message: 'Tu cuenta ha sido desactivada'
    });
  }

  // Actualizar último login
  user.last_login = new Date();
  await user.save();

  // Generar token
  const token = user.getSignedJwtToken();

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role,
      is_verified: user.is_verified
    }
  });
}));

// @desc    Obtener usuario actual
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: { exclude: ['password'] }
  });

  res.json({
    success: true,
    user
  });
}));

// @desc    Cerrar sesión
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, asyncHandler(async (req, res) => {
  res.json({
    success: true,
    message: 'Sesión cerrada correctamente'
  });
}));

// @desc    Actualizar perfil
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, [
  body('nombre')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('calle')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('La calle debe tener entre 2 y 100 caracteres'),
  body('numero')
    .optional()
    .trim()
    .isLength({ min: 1, max: 10 })
    .withMessage('El número debe tener entre 1 y 10 caracteres'),
  body('whatsapp')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Ingresa un número de WhatsApp válido')
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

  // Actualizar campos permitidos
  const fieldsToUpdate = ['nombre', 'calle', 'numero', 'whatsapp', 'preferences'];
  fieldsToUpdate.forEach(field => {
    if (req.body[field] !== undefined) {
      user[field] = req.body[field];
    }
  });

  await user.save();

  res.json({
    success: true,
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      role: user.role,
      is_verified: user.is_verified
    }
  });
}));

// @desc    Cambiar contraseña
// @route   PUT /api/auth/password
// @access  Private
router.put('/password', protect, [
  body('currentPassword')
    .exists()
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

  const { currentPassword, newPassword } = req.body;

  const user = await User.findByPk(req.user.id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'Usuario no encontrado'
    });
  }

  // Verificar contraseña actual
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: 'La contraseña actual es incorrecta'
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

// @desc    Solicitar reset de contraseña
// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Ingresa un email válido')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email } = req.body;

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'No existe una cuenta con ese email'
    });
  }

  // Generar token de reset
  const resetToken = user.getResetPasswordToken();
  await user.save();

  // TODO: Enviar email con el token
  // Por ahora solo devolvemos el token (en producción esto debe ser por email)
  res.json({
    success: true,
    message: 'Se ha enviado un email con las instrucciones para resetear tu contraseña',
    resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
  });
}));

// @desc    Resetear contraseña
// @route   PUT /api/auth/reset-password/:token
// @access  Public
router.put('/reset-password/:token', [
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
], asyncHandler(async (req, res) => {
  // Verificar errores de validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { token: resetToken } = req.params;
  const { password } = req.body;

  // Buscar usuario con el token válido
  const user = await User.findOne({
    where: {
      reset_password_token: resetToken,
      reset_password_expire: { [require('sequelize').Op.gt]: new Date() }
    }
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      message: 'Token inválido o expirado'
    });
  }

  // Actualizar contraseña y limpiar token
  user.password = password;
  user.reset_password_token = null;
  user.reset_password_expire = null;
  await user.save();

  res.json({
    success: true,
    message: 'Contraseña actualizada correctamente'
  });
}));

module.exports = router; 