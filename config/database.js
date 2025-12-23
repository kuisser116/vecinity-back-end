const { Sequelize } = require('sequelize');
require('dotenv').config();

// Configuración de la base de datos
// Configuración de la base de datos
let sequelize;

if (process.env.DATABASE_URL) {
  // Configuración para Producción (Render)
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: false,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true
    },
    timezone: '+00:00'
  });
} else {
  // Configuración para Desarrollo Local
  sequelize = new Sequelize(
    process.env.DB_NAME || 'vecinity_db',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'root',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: process.env.DB_DIALECT || 'postgres',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000
      },
      define: {
        timestamps: true,
        underscored: true,
        freezeTableName: true
      },
      // timezone: '+00:00' // Postgres maneja esto diferente
    }
  );
}

// Función para probar la conexión
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a MySQL establecida correctamente.');
    return true;
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error.message);
    return false;
  }
};

// Función para sincronizar modelos
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('✅ Base de datos sincronizada correctamente.');
    return true;
  } catch (error) {
    console.error('❌ Error sincronizando la base de datos:', error.message);
    return false;
  }
};

// Función para cerrar la conexión
const closeConnection = async () => {
  try {
    await sequelize.close();
    console.log('✅ Conexión a MySQL cerrada correctamente.');
  } catch (error) {
    console.error('❌ Error cerrando la conexión:', error.message);
  }
};

module.exports = {
  sequelize,
  testConnection,
  syncDatabase,
  closeConnection
}; 