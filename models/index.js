const { sequelize } = require('../config/database');
const User = require('./User');
const Category = require('./Category');
const Report = require('./Report');

// Definir asociaciones
User.hasMany(Report, {
  foreignKey: 'usuario_id',
  as: 'reportes'
});

Report.belongsTo(User, {
  foreignKey: 'usuario_id',
  as: 'usuario'
});

// Usuario asignado a reporte
User.hasMany(Report, {
  foreignKey: 'asignado_a',
  as: 'reportes_asignados'
});

Report.belongsTo(User, {
  foreignKey: 'asignado_a',
  as: 'asignado_a_usuario'
});

// Usuario que moderó el reporte
User.hasMany(Report, {
  foreignKey: 'moderado_por',
  as: 'reportes_moderados'
});

Report.belongsTo(User, {
  foreignKey: 'moderado_por',
  as: 'moderado_por_usuario'
});

// Categorías
Category.hasMany(Report, {
  foreignKey: 'categoria_id',
  as: 'reportes'
});

Report.belongsTo(Category, {
  foreignKey: 'categoria_id',
  as: 'categoria'
});

// Usuario que creó la categoría
User.hasMany(Category, {
  foreignKey: 'created_by',
  as: 'categorias_creadas'
});

Category.belongsTo(User, {
  foreignKey: 'created_by',
  as: 'createdBy'
});

// Usuario que actualizó la categoría
User.hasMany(Category, {
  foreignKey: 'updated_by',
  as: 'categorias_actualizadas'
});

Category.belongsTo(User, {
  foreignKey: 'updated_by',
  as: 'updatedBy'
});

// Función para sincronizar todos los modelos
const syncAllModels = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('✅ Todos los modelos sincronizados correctamente.');
    return true;
  } catch (error) {
    console.error('❌ Error sincronizando modelos:', error.message);
    return false;
  }
};

// Función para crear datos iniciales
const createInitialData = async () => {
  try {
    // Crear superadmin por defecto
    const superadminExists = await User.findOne({
      where: { role: 'superadmin' }
    });

    if (!superadminExists) {
      await User.create({
        nombre: 'Super Administrador',
        calle: 'Sistema',
        numero: '1',
        email: 'admin@vecinity.com',
        whatsapp: '+525512345678',
        password: 'admin123',
        role: 'superadmin',
        is_verified: true,
        is_active: true
      });
      console.log('✅ Superadmin creado por defecto.');
    }

    // Crear categorías por defecto
    const categoriesExist = await Category.findOne();
    if (!categoriesExist) {
      const defaultCategories = [
        {
          nombre: 'Infraestructura',
          descripcion: 'Problemas de infraestructura urbana',
          color: '#3B82F6',
          icono: 'building',
          orden: 1,
          subcategorias: [
            { nombre: 'Coladeras', descripcion: 'Problemas con coladeras' },
            { nombre: 'Calles', descripcion: 'Problemas con calles' },
            { nombre: 'Alumbrado', descripcion: 'Problemas de alumbrado público' }
          ],
          created_by: 1
        },
        {
          nombre: 'Basura',
          descripcion: 'Problemas relacionados con la basura',
          color: '#10B981',
          icono: 'trash',
          orden: 2,
          subcategorias: [
            { nombre: 'Recolección', descripcion: 'Problemas con recolección de basura' },
            { nombre: 'Contenedores', descripcion: 'Problemas con contenedores' }
          ],
          created_by: 1
        },
        {
          nombre: 'Árboles',
          descripcion: 'Problemas con árboles y vegetación',
          color: '#059669',
          icono: 'tree',
          orden: 3,
          subcategorias: [
            { nombre: 'Caídos', descripcion: 'Árboles caídos' },
            { nombre: 'Poda', descripcion: 'Necesidad de poda' }
          ],
          created_by: 1
        }
      ];

      for (const category of defaultCategories) {
        await Category.create(category);
      }
      console.log('✅ Categorías por defecto creadas.');
    }

    return true;
  } catch (error) {
    console.error('❌ Error creando datos iniciales:', error.message);
    return false;
  }
};

module.exports = {
  sequelize,
  User,
  Category,
  Report,
  syncAllModels,
  createInitialData
}; 