const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Category = sequelize.define('Category', {
  id: { 
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  nombre: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      len: [2, 50],
      notEmpty: true
    }
  },
  descripcion: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      len: [5, 200],
      notEmpty: true
    }
  },
  icono: {
    type: DataTypes.STRING(50),
    defaultValue: 'default-icon',
    validate: {
      len: [1, 50]
    }
  },
  color: {
    type: DataTypes.STRING(7),
    defaultValue: '#3B82F6',
    validate: {
      is: /^#[0-9A-F]{6}$/i
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  orden: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  subcategorias: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [] // Siempre será un array vacío si no hay subcategorías
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'categories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// Métodos de instancia
Category.prototype.hasSubcategory = function(subcategoryName) {
  if (!this.subcategorias || !Array.isArray(this.subcategorias)) return false;
  return this.subcategorias.some(sub => sub.nombre === subcategoryName);
};

Category.prototype.addSubcategory = function(subcategory) {
  if (!this.subcategorias || !Array.isArray(this.subcategorias)) this.subcategorias = [];
  if (!this.hasSubcategory(subcategory.nombre)) {
    this.subcategorias.push(subcategory);
    return this.save();
  }
  throw new Error('La subcategoría ya existe');
};

Category.prototype.removeSubcategory = function(subcategoryName) {
  if (!this.subcategorias || !Array.isArray(this.subcategorias)) this.subcategorias = [];
  this.subcategorias = this.subcategorias.filter(sub => sub.nombre !== subcategoryName);
  return this.save();
};

// Métodos de clase
Category.getActiveCategories = function() {
  return this.findAll({
    where: { is_active: true },
    order: [['orden', 'ASC']],
    include: [{
      model: sequelize.models.User,
      as: 'createdBy',
      attributes: ['id', 'nombre']
    }]
  });
};

Category.getCategoryWithSubcategories = function(categoryId) {
  return this.findByPk(categoryId, {
    include: [{
      model: sequelize.models.User,
      as: 'createdBy',
      attributes: ['id', 'nombre']
    }]
  });
};

module.exports = Category;
