-- ========================================
-- SCRIPT DE CREACIÓN DE BASE DE DATOS VECINITY
-- ========================================

-- Crear la base de datos
CREATE DATABASE IF NOT EXISTS vecinity_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

-- Usar la base de datos
USE vecinity_db;

-- Crear usuario para la aplicación (opcional)
-- CREATE USER IF NOT EXISTS 'vecinity_user'@'localhost' IDENTIFIED BY 'tu_password_seguro';
-- GRANT ALL PRIVILEGES ON vecinity_db.* TO 'vecinity_user'@'localhost';
-- FLUSH PRIVILEGES;

-- ========================================
-- TABLA DE USUARIOS
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    calle VARCHAR(100) NOT NULL,
    numero VARCHAR(10) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    whatsapp VARCHAR(20) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('usuario', 'admin_operativo', 'admin_general', 'superadmin') DEFAULT 'usuario' NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    verification_token VARCHAR(255),
    reset_password_token VARCHAR(255),
    reset_password_expire DATETIME,
    last_login DATETIME,
    avatar VARCHAR(255),
    preferences JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_users_email (email),
    INDEX idx_users_role (role),
    INDEX idx_users_active (is_active),
    INDEX idx_users_created (created_at)
);

-- ========================================
-- TABLA DE CATEGORÍAS
-- ========================================
CREATE TABLE IF NOT EXISTS categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(200) NOT NULL,
    icono VARCHAR(50) DEFAULT 'default-icon',
    color VARCHAR(7) DEFAULT '#3B82F6',
    subcategorias JSON DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    orden INT DEFAULT 0 NOT NULL,
    created_by INT NOT NULL,
    updated_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_categories_nombre (nombre),
    INDEX idx_categories_active (is_active),
    INDEX idx_categories_orden (orden)
);

-- ========================================
-- TABLA DE REPORTES
-- ========================================
CREATE TABLE IF NOT EXISTS reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo VARCHAR(100) NOT NULL,
    descripcion TEXT NOT NULL,
    direccion VARCHAR(200) NOT NULL,
    latitud DECIMAL(10, 8) NOT NULL,
    longitud DECIMAL(11, 8) NOT NULL,
    categoria_id INT NOT NULL,
    subcategoria VARCHAR(50) NOT NULL,
    estatus ENUM('nuevo', 'en_proceso', 'resuelto', 'cerrado') DEFAULT 'nuevo' NOT NULL,
    prioridad ENUM('baja', 'media', 'alta', 'urgente') DEFAULT 'media' NOT NULL,
    folio VARCHAR(50),
    multimedia JSON DEFAULT '[]',
    usuario_id INT NOT NULL,
    asignado_a INT,
    historial_estatus JSON DEFAULT '[]',
    comentarios JSON DEFAULT '[]',
    votos JSON DEFAULT '{"positivos": [], "negativos": []}',
    etiquetas JSON DEFAULT '[]',
    is_publico BOOLEAN DEFAULT TRUE NOT NULL,
    is_moderado BOOLEAN DEFAULT FALSE NOT NULL,
    moderado_por INT,
    fecha_moderacion DATETIME,
    motivo_moderacion TEXT,
    visitas INT DEFAULT 0 NOT NULL,
    ultima_visita DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (categoria_id) REFERENCES categories(id) ON DELETE RESTRICT,
    FOREIGN KEY (usuario_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (asignado_a) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (moderado_por) REFERENCES users(id) ON DELETE SET NULL,
    
    INDEX idx_reports_usuario (usuario_id),
    INDEX idx_reports_categoria (categoria_id),
    INDEX idx_reports_estatus (estatus),
    INDEX idx_reports_publico (is_publico),
    INDEX idx_reports_folio (folio),
    INDEX idx_reports_created (created_at),
    INDEX idx_reports_estatus_fecha (estatus, created_at),
    SPATIAL INDEX idx_reports_location (longitud, latitud),
    FULLTEXT INDEX idx_reports_search (titulo, descripcion, direccion, folio)
);

-- ========================================
-- INSERTAR DATOS INICIALES
-- ========================================

-- Insertar superadmin por defecto
INSERT IGNORE INTO users (nombre, calle, numero, email, whatsapp, password, role, is_verified, is_active) VALUES
('Super Administrador', 'Sistema', '1', 'admin@vecinity.com', '+525512345678', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iK2', 'superadmin', TRUE, TRUE);

-- Insertar categorías por defecto
INSERT IGNORE INTO categories (nombre, descripcion, color, icono, orden, subcategorias, created_by) VALUES
('Infraestructura', 'Problemas de infraestructura urbana', '#3B82F6', 'building', 1, 
 '[{"nombre": "Coladeras", "descripcion": "Problemas con coladeras"}, {"nombre": "Calles", "descripcion": "Problemas con calles"}, {"nombre": "Alumbrado", "descripcion": "Problemas de alumbrado público"}]', 1),

('Basura', 'Problemas relacionados con la basura', '#10B981', 'trash', 2,
 '[{"nombre": "Recolección", "descripcion": "Problemas con recolección de basura"}, {"nombre": "Contenedores", "descripcion": "Problemas con contenedores"}]', 1),

('Árboles', 'Problemas con árboles y vegetación', '#059669', 'tree', 3,
 '[{"nombre": "Caídos", "descripcion": "Árboles caídos"}, {"nombre": "Poda", "descripcion": "Necesidad de poda"}]', 1);

-- ========================================
-- VISTAS ÚTILES
-- ========================================

-- Vista para reportes con información completa
CREATE OR REPLACE VIEW v_reports_complete AS
SELECT 
    r.*,
    u.nombre as usuario_nombre,
    u.email as usuario_email,
    c.nombre as categoria_nombre,
    c.color as categoria_color,
    c.icono as categoria_icono,
    a.nombre as asignado_nombre,
    m.nombre as moderado_nombre,
    JSON_LENGTH(r.comentarios) as num_comentarios,
    JSON_LENGTH(r.votos->'$.positivos') - JSON_LENGTH(r.votos->'$.negativos') as total_votos
FROM reports r
LEFT JOIN users u ON r.usuario_id = u.id
LEFT JOIN categories c ON r.categoria_id = c.id
LEFT JOIN users a ON r.asignado_a = a.id
LEFT JOIN users m ON r.moderado_por = m.id;

-- Vista para estadísticas de reportes
CREATE OR REPLACE VIEW v_reports_stats AS
SELECT 
    estatus,
    COUNT(*) as total,
    COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as ultimos_7_dias,
    COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 END) as ultimos_30_dias
FROM reports
GROUP BY estatus;

-- ========================================
-- PROCEDIMIENTOS ALMACENADOS
-- ========================================

-- Procedimiento para limpiar tokens expirados
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS sp_cleanup_expired_tokens()
BEGIN
    UPDATE users 
    SET reset_password_token = NULL, 
        reset_password_expire = NULL 
    WHERE reset_password_expire < NOW();
END //
DELIMITER ;

-- Procedimiento para obtener reportes por ubicación
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS sp_get_reports_by_location(
    IN p_lat DECIMAL(10, 8),
    IN p_lng DECIMAL(11, 8),
    IN p_radius_km DECIMAL(10, 2)
)
BEGIN
    SELECT 
        r.*,
        u.nombre as usuario_nombre,
        c.nombre as categoria_nombre,
        c.color as categoria_color,
        ST_Distance_Sphere(
            POINT(r.longitud, r.latitud), 
            POINT(p_lng, p_lat)
        ) / 1000 as distancia_km
    FROM reports r
    LEFT JOIN users u ON r.usuario_id = u.id
    LEFT JOIN categories c ON r.categoria_id = c.id
    WHERE r.is_publico = TRUE
    AND ST_Distance_Sphere(
        POINT(r.longitud, r.latitud), 
        POINT(p_lng, p_lat)
    ) <= (p_radius_km * 1000)
    ORDER BY distancia_km ASC;
END //
DELIMITER ;

-- ========================================
-- EVENTOS PROGRAMADOS
-- ========================================

-- Evento para limpiar tokens expirados diariamente
CREATE EVENT IF NOT EXISTS ev_cleanup_tokens
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_TIMESTAMP
DO CALL sp_cleanup_expired_tokens();

-- ========================================
-- TRIGGERS
-- ========================================

-- Trigger para actualizar updated_at automáticamente
DELIMITER //
CREATE TRIGGER IF NOT EXISTS tr_users_update
BEFORE UPDATE ON users
FOR EACH ROW
SET NEW.updated_at = CURRENT_TIMESTAMP;
//

CREATE TRIGGER IF NOT EXISTS tr_categories_update
BEFORE UPDATE ON categories
FOR EACH ROW
SET NEW.updated_at = CURRENT_TIMESTAMP;
//

CREATE TRIGGER IF NOT EXISTS tr_reports_update
BEFORE UPDATE ON reports
FOR EACH ROW
SET NEW.updated_at = CURRENT_TIMESTAMP;
//
DELIMITER ;

-- ========================================
-- PERMISOS Y CONFIGURACIÓN FINAL
-- ========================================

-- Mostrar información de la base de datos
SELECT 
    'Base de datos creada exitosamente' as mensaje,
    DATABASE() as base_datos,
    VERSION() as version_mysql;

-- Mostrar tablas creadas
SHOW TABLES;

-- Mostrar configuración de caracteres
SHOW VARIABLES LIKE 'character_set%';
SHOW VARIABLES LIKE 'collation%'; 