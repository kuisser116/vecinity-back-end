const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Importar configuración de base de datos
const { testConnection, syncDatabase } = require('./config/database');
const { syncAllModels, createInitialData } = require('./models');

// Importar rutas
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const reportRoutes = require('./routes/reports');
const categoryRoutes = require('./routes/categories');
const adminRoutes = require('./routes/admin');

// Importar middleware
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

const app = express();

// Configuración de seguridad
app.use(helmet());
app.use(xss());
app.use(hpp());

// Rate limiting
const limiter = rateLimit({
  windowMs: (process.env.RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX || 100,
  message: {
    error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.'
  }
});
app.use('/api/', limiter);

// Middleware
app.use(compression());
app.use(morgan(process.env.LOG_LEVEL || 'combined'));
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Servir archivos estáticos con encabezados para cross-origin
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath) => {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  }
}));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'API de Vecinity funcionando correctamente',
    timestamp: new Date().toISOString(),
    database: 'MySQL',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Manejo de errores
app.use(errorHandler.errorHandler);

// Ruta para manejar rutas no encontradas
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Ruta no encontrada'
  });
});

// Función para inicializar la base de datos
const initializeDatabase = async () => {
  try {
    const connectionOk = await testConnection();
    if (!connectionOk) throw new Error('No se pudo conectar a la base de datos');

    const syncOk = await syncAllModels(false);
    if (!syncOk) throw new Error('No se pudieron sincronizar los modelos');

    await createInitialData();
    console.log('Base de datos inicializada correctamente.');
    return true;
  } catch (error) {
    console.error('Error inicializando la base de datos:', error.message);
    return false;
  }
};

// Iniciar servidor
const PORT = process.env.PORT || 5000;
const startServer = async () => {
  try {
    const dbInitialized = await initializeDatabase();
    if (!dbInitialized) process.exit(1);

    app.listen(PORT, () => {
      console.log('Servidor iniciado correctamente');
      console.log(`Puerto: ${PORT}`);
      console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Base de datos: MySQL`);
      console.log(`URL: http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('Error iniciando el servidor:', error.message);
    process.exit(1);
  }
};

startServer();

// Manejo de errores no capturados
process.on('unhandledRejection', (err, promise) => {
  console.error('Error no manejado:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Excepción no capturada:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
});

// Manejo de señales de terminación
process.on('SIGTERM', () => {
  console.log('Recibida señal SIGTERM. Cerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Recibida señal SIGINT. Cerrando servidor...');
  process.exit(0);
});
