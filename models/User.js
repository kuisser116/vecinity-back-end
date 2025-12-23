const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      len: [2, 50],
      notEmpty: true
    }
  },
  calle: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [2, 100],
      notEmpty: true
    }
  },
  numero: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      len: [1, 10],
      notEmpty: true
    }
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
      notEmpty: true
    }
  },
  whatsapp: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      notEmpty: true,
      is: /^\+?[1-9]\d{1,14}$/
    }
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      len: [6, 255],
      notEmpty: true
    }
  },
  role: {
    type: DataTypes.ENUM('usuario', 'admin_operativo', 'admin_general', 'superadmin'),
    defaultValue: 'usuario',
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  is_verified: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  verification_token: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  reset_password_token: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  reset_password_expire: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true
  },
  avatar: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  preferences: {
    type: DataTypes.JSON,
    defaultValue: {
      notifications: {
        email: true,
        whatsapp: true
      },
      language: 'es'
    }
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    }
  }
});

// Métodos de instancia
User.prototype.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

User.prototype.getSignedJwtToken = function() {
  return jwt.sign(
    { 
      id: this.id,
      role: this.role,
      email: this.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRE || '30d'
    }
  );
};

User.prototype.getVerificationToken = function() {
  const verificationToken = crypto.randomBytes(20).toString('hex');
  this.verification_token = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
  
  return verificationToken;
};

User.prototype.getResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString('hex');
  this.reset_password_token = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.reset_password_expire = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
  
  return resetToken;
};

User.prototype.hasPermission = function(permission) {
  const permissions = {
    usuario: ['read_reports', 'create_reports', 'update_own_reports', 'delete_own_reports'],
    admin_operativo: ['read_reports', 'create_reports', 'update_reports', 'moderate_content'],
    admin_general: ['read_reports', 'create_reports', 'update_reports', 'delete_reports', 'manage_categories', 'manage_users'],
    superadmin: ['read_reports', 'create_reports', 'update_reports', 'delete_reports', 'manage_categories', 'manage_users', 'manage_admins', 'system_config']
  };
  
  return permissions[this.role]?.includes(permission) || false;
};

User.prototype.isAdmin = function() {
  return ['admin_operativo', 'admin_general', 'superadmin'].includes(this.role);
};

User.prototype.isSuperAdmin = function() {
  return this.role === 'superadmin';
};

// Métodos de clase
User.findByEmail = function(email) {
  return this.findOne({ where: { email } });
};

User.findByVerificationToken = function(token) {
  return this.findOne({ where: { verification_token: token } });
};

User.findByResetPasswordToken = function(token) {
  return this.findOne({ 
    where: { 
      reset_password_token: token,
      reset_password_expire: { [sequelize.Op.gt]: new Date() }
    }
  });
};

module.exports = User; 