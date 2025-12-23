const errorHandler = (err, req, res, next) => {
  // Evitar enviar múltiples respuestas
  if (res.headersSent) {
    return next(err);
  }

  let error = {
    message: err.message || 'Error interno del servidor',
    statusCode: err.statusCode || err.status || 500
  };

  // Log del error para debugging (con más contexto)
  console.error(`Error ${error.statusCode}: ${error.message}`);
  console.error('Stack:', err.stack);
  console.error('Request:', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Errores de MySQL/MariaDB
  if (err.code) {
    switch (err.code) {
      // Clave duplicada
      case 'ER_DUP_ENTRY':
        const duplicateField = err.sqlMessage?.match(/for key '(.+?)'/)?.[1] || 'campo';
        error = {
          message: `Ya existe un registro con ese ${duplicateField}`,
          statusCode: 409
        };
        break;

      // Violación de clave foránea
      case 'ER_NO_REFERENCED_ROW_2':
        error = {
          message: 'Referencia inválida - el recurso relacionado no existe',
          statusCode: 400
        };
        break;

      // No se puede eliminar debido a clave foránea
      case 'ER_ROW_IS_REFERENCED_2':
        error = {
          message: 'No se puede eliminar - existen registros relacionados',
          statusCode: 409
        };
        break;

      // Tabla no existe
      case 'ER_NO_SUCH_TABLE':
        error = {
          message: 'Tabla no encontrada en la base de datos',
          statusCode: 500
        };
        break;

      // Campo desconocido
      case 'ER_BAD_FIELD_ERROR':
        error = {
          message: 'Campo no válido en la consulta',
          statusCode: 400
        };
        break;

      // Error de sintaxis SQL
      case 'ER_PARSE_ERROR':
        error = {
          message: 'Error en la consulta SQL',
          statusCode: 500
        };
        break;

      // Conexión perdida
      case 'PROTOCOL_CONNECTION_LOST':
        error = {
          message: 'Conexión con la base de datos perdida',
          statusCode: 503
        };
        break;

      // Demasiadas conexiones
      case 'ER_CON_COUNT_ERROR':
        error = {
          message: 'Demasiadas conexiones a la base de datos',
          statusCode: 503
        };
        break;

      // Acceso denegado
      case 'ER_ACCESS_DENIED_ERROR':
        error = {
          message: 'Error de autenticación con la base de datos',
          statusCode: 500
        };
        break;
    }
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    error = {
      message: 'Token no válido',
      statusCode: 401
    };
  }

  // Error de JWT expirado
  else if (err.name === 'TokenExpiredError') {
    error = {
      message: 'Token expirado',
      statusCode: 401
    };
  }

  // Errores de Multer para archivos
  else if (err.name === 'MulterError') {
    let message = 'Error al subir archivo';
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'El archivo es demasiado grande';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = 'Demasiados archivos';
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Archivo inesperado';
    }
    error = {
      message,
      statusCode: 400
    };
  }

  // Errores de validación de entrada (express-validator)
  else if (err.name === 'ValidationError' && err.errors) {
    const messages = err.errors.map(e => e.msg).join(', ');
    error = {
      message: `Error de validación: ${messages}`,
      statusCode: 400
    };
  }

  // Error de rate limiting
  else if (err.status === 429) {
    error = {
      message: 'Demasiadas solicitudes, intenta de nuevo más tarde',
      statusCode: 429
    };
  }

  // Error de permisos
  else if (err.status === 403) {
    error = {
      message: 'No tienes permisos para realizar esta acción',
      statusCode: 403
    };
  }

  // Error de autenticación
  else if (err.status === 401) {
    error = {
      message: 'No autorizado',
      statusCode: 401
    };
  }

  // Error de recurso no encontrado
  else if (err.status === 404) {
    error = {
      message: 'Recurso no encontrado',
      statusCode: 404
    };
  }

  // Error de validación de entrada
  else if (err.status === 422) {
    error = {
      message: 'Datos de entrada inválidos',
      statusCode: 422
    };
  }

  // Error de servidor interno
  else if (err.status === 500) {
    error = {
      message: 'Error interno del servidor',
      statusCode: 500
    };
  }

  // Respuesta de error
  res.status(error.statusCode).json({
    success: false,
    error: error.message,
    // Forzamos mostrar detalles para depuración, incluso en "producción" simulada
    stack: err.stack,
    sqlMessage: err.sqlMessage,
    sql: err.sql,
    errno: err.errno,
    code: err.code
  });
};

// Middleware para manejar rutas no encontradas
const notFound = (req, res, next) => {
  const error = new Error(`Ruta no encontrada - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

// Middleware para manejar errores asíncronos
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Middleware para validar que el recurso existe (útil para MySQL)
const validateResourceExists = (model, idField = 'id') => {
  return async (req, res, next) => {
    try {
      const id = req.params[idField] || req.params.id;
      const resource = await model.findByPk ?
        await model.findByPk(id) :
        await model.findById(id);

      if (!resource) {
        const error = new Error('Recurso no encontrado');
        error.statusCode = 404;
        return next(error);
      }

      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  errorHandler,
  notFound,
  asyncHandler,
  validateResourceExists
};