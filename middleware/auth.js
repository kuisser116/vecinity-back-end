const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware para proteger rutas
const protect = async (req, res, next) => {
  let token;

  // Verificar si el token existe en los headers
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    // Verificar si el token existe en las cookies
    token = req.cookies.token;
  }

  // Verificar si el token existe
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No tienes acceso a este recurso'
    });
  }

  try {
    // Verificar el token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ✅ CORREGIDO: Usar Sequelize en lugar de Mongoose
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token no válido'
      });
    }

    // ✅ CORREGIDO: Usar is_active (Sequelize) en lugar de isActive
    if (!user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'Tu cuenta ha sido desactivada'
      });
    }

    // Agregar el usuario a la request
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token no válido'
    });
  }
};

// Middleware para verificar roles específicos
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No tienes acceso a este recurso'
      });
    }

    // ✅ CORREGIDO: Verificar roles array (Sequelize) en lugar de role único
    const userRoles = req.user.roles || ['usuario'];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return res.status(403).json({
        success: false,
        message: `Tu rol no tiene acceso a este recurso`
      });
    }

    next();
  };
};

// Middleware para verificar permisos específicos
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'No tienes acceso a este recurso'
      });
    }

    // ✅ CORREGIDO: Implementar verificación de permisos para Sequelize
    // Asumiendo que los permisos están en el modelo User
    if (!req.user.hasPermission || !req.user.hasPermission(permission)) {
      return res.status(403).json({
        success: false,
        message: `No tienes el permiso ${permission} para acceder a este recurso`
      });
    }

    next();
  };
};

// Middleware para verificar si es propietario del recurso
const checkOwnership = (resourceModel, resourceIdField = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdField];
      
      // ✅ CORREGIDO: Usar findByPk en lugar de findById
      const resource = await resourceModel.findByPk(resourceId);

      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Recurso no encontrado'
        });
      }

      // ✅ CORREGIDO: Verificar roles admin para Sequelize
      const userRoles = req.user.roles || ['usuario'];
      const isAdmin = userRoles.includes('admin_general') || userRoles.includes('superadmin');

      // Permitir acceso si es admin o superadmin
      if (isAdmin) {
        return next();
      }

      // ✅ CORREGIDO: Verificar propiedad usando usuario_id (Sequelize)
      if (resource.usuario_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para modificar este recurso'
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error al verificar permisos'
      });
    }
  };
};

// Middleware para verificar si el usuario está verificado
const requireVerification = (req, res, next) => {
  // ✅ CORREGIDO: Usar is_verified (Sequelize)
  if (!req.user.is_verified) {
    return res.status(403).json({
      success: false,
      message: 'Tu cuenta debe estar verificada para acceder a este recurso'
    });
  }
  next();
};

// Middleware para obtener usuario sin requerir autenticación
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // ✅ CORREGIDO: Usar Sequelize
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password'] }
      });
      
      if (user && user.is_active) {
        req.user = user;
      }
    } catch (error) {
      // Token inválido, continuar sin usuario
    }
  }

  next();
};

module.exports = {
  protect,
  authorize,
  checkPermission,
  checkOwnership,
  requireVerification,
  optionalAuth
};