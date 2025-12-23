const { DataTypes } = require('sequelize');
const moment = require('moment');
const { sequelize } = require('../config/database');

const Report = sequelize.define('Report', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  titulo: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [5, 100],
      notEmpty: true
    }
  },
  descripcion: {
    type: DataTypes.TEXT,
    allowNull: false,
    validate: {
      len: [10, 1000],
      notEmpty: true
    }
  },
  direccion: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      len: [5, 200],
      notEmpty: true
    }
  },
  latitud: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: false,
    validate: {
      min: -90,
      max: 90
    }
  },
  longitud: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: false,
    validate: {
      min: -180,
      max: 180
    }
  },
  categoria_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'categories',
      key: 'id'
    }
  },

  estatus: {
    type: DataTypes.ENUM('nuevo', 'en_proceso', 'resuelto', 'cerrado'),
    defaultValue: 'nuevo',
    allowNull: false
  },
  prioridad: {
    type: DataTypes.ENUM('baja', 'media', 'alta', 'urgente'),
    defaultValue: 'media',
    allowNull: false
  },
  folio: {
    type: DataTypes.STRING(50),
    allowNull: true,
    validate: {
      len: [0, 50]
    }
  },
  multimedia: {
    type: DataTypes.JSON,
    defaultValue: [],
    validate: {
      isValidMultimedia(value) {
        if (!Array.isArray(value)) {
          throw new Error('La multimedia debe ser un array');
        }
        value.forEach(media => {
          if (!media.tipo || !['imagen', 'video'].includes(media.tipo)) {
            throw new Error('Cada elemento multimedia debe tener un tipo válido');
          }
          if (!media.url) {
            throw new Error('Cada elemento multimedia debe tener una URL');
          }
        });
      }
    }
  },
  usuario_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  asignado_a: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  historial_estatus: {
    type: DataTypes.JSON,
    defaultValue: [],
    validate: {
      isValidHistorial(value) {
        if (!Array.isArray(value)) {
          throw new Error('El historial debe ser un array');
        }
        value.forEach(hist => {
          if (!hist.estatus || !['nuevo', 'en_proceso', 'resuelto', 'cerrado'].includes(hist.estatus)) {
            throw new Error('Cada elemento del historial debe tener un estatus válido');
          }
          if (!hist.cambiado_por) {
            throw new Error('Cada elemento del historial debe tener un usuario que lo cambió');
          }
        });
      }
    }
  },
  comentarios: {
    type: DataTypes.JSON,
    defaultValue: [],
    validate: {
      isValidComentarios(value) {
        if (!Array.isArray(value)) {
          throw new Error('Los comentarios deben ser un array');
        }
        value.forEach(com => {
          if (!com.usuario_id) {
            throw new Error('Cada comentario debe tener un usuario');
          }
          if (!com.contenido || com.contenido.length < 1 || com.contenido.length > 500) {
            throw new Error('Cada comentario debe tener contenido válido');
          }
        });
      }
    }
  },
  votos: {
    type: DataTypes.JSON,
    defaultValue: {
      positivos: [],
      negativos: []
    },
    validate: {
      isValidVotos(value) {
        if (!value.positivos || !value.negativos || !Array.isArray(value.positivos) || !Array.isArray(value.negativos)) {
          throw new Error('Los votos deben tener arrays de positivos y negativos');
        }
      }
    }
  },
  etiquetas: {
    type: DataTypes.JSON,
    defaultValue: [],
    validate: {
      isValidEtiquetas(value) {
        if (!Array.isArray(value)) {
          throw new Error('Las etiquetas deben ser un array');
        }
        value.forEach(etiqueta => {
          if (typeof etiqueta !== 'string' || etiqueta.length < 1 || etiqueta.length > 20) {
            throw new Error('Cada etiqueta debe ser una cadena válida');
          }
        });
      }
    }
  },
  is_publico: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  is_moderado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  moderado_por: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  fecha_moderacion: {
    type: DataTypes.DATE,
    allowNull: true
  },
  motivo_moderacion: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  visitas: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  ultima_visita: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  }
}, {
  tableName: 'reports',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeCreate: (report) => {
      // Agregar el primer estatus al historial
      report.historial_estatus = [{
        estatus: report.estatus,
        comentario: 'Reporte creado',
        cambiado_por: report.usuario_id,
        fecha_cambio: new Date()
      }];
    }
  }
});

// Métodos de instancia
Report.prototype.cambiarEstatus = function(nuevoEstatus, comentario, multimedia, usuarioId) {
  if (this.estatus !== nuevoEstatus) {
    this.estatus = nuevoEstatus;
    this.historial_estatus.push({
      estatus: nuevoEstatus,
      comentario: comentario || `Estatus cambiado a ${nuevoEstatus}`,
      multimedia: multimedia || [],
      cambiado_por: usuarioId,
      fecha_cambio: new Date()
    });
    return this.save();
  }
  return Promise.resolve(this);
};

Report.prototype.agregarComentario = function(usuarioId, contenido, multimedia) {
  this.comentarios.push({
    usuario_id: usuarioId,
    contenido,
    multimedia: multimedia || [],
    created_at: new Date()
  });
  return this.save();
};

Report.prototype.votar = function(usuarioId, tipo) {
  const votosUsuario = this.votos.positivos.find(v => v.usuario_id === usuarioId) ||
                      this.votos.negativos.find(v => v.usuario_id === usuarioId);
  
  if (votosUsuario) {
    // Remover voto existente
    this.votos.positivos = this.votos.positivos.filter(v => v.usuario_id !== usuarioId);
    this.votos.negativos = this.votos.negativos.filter(v => v.usuario_id !== usuarioId);
  }
  
  // Agregar nuevo voto
  if (tipo === 'positivo') {
    this.votos.positivos.push({ usuario_id: usuarioId, fecha: new Date() });
  } else if (tipo === 'negativo') {
    this.votos.negativos.push({ usuario_id: usuarioId, fecha: new Date() });
  }
  
  return this.save();
};

Report.prototype.incrementarVisitas = function() {
  this.visitas += 1;
  this.ultima_visita = new Date();
  return this.save();
};

// Métodos de clase
Report.buscarPorUbicacion = function(lat, lng, radioKm = 5) {
  const radioMetros = radioKm * 1000;
  return this.findAll({
    where: {
      is_publico: true,
      [sequelize.literal(`ST_Distance_Sphere(
        POINT(longitud, latitud), 
        POINT(${lng}, ${lat})
      ) <= ${radioMetros}`)]: true
    },
    include: [
      {
        model: sequelize.models.User,
        as: 'usuario',
        attributes: ['id', 'nombre']
      },
      {
        model: sequelize.models.Category,
        as: 'categoria',
        attributes: ['id', 'nombre', 'color']
      }
    ]
  });
};

Report.obtenerEstadisticas = function() {
  return this.findAll({
    attributes: [
      'estatus',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['estatus']
  });
};

module.exports = Report; 