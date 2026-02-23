-- Single ESP gateway migration (safe for old/new DB states)

-- Ensure iot_devices exists (older deployments may not have IoT tables yet)
CREATE TABLE IF NOT EXISTS `iot_devices` (
  `id` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NULL,
  `deviceToken` VARCHAR(191) NOT NULL,
  `isGateway` BOOLEAN NOT NULL DEFAULT true,
  `lastSeen` DATETIME(3) NULL,
  `signalStrength` INTEGER NULL,
  `isOnline` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `iot_devices_deviceToken_key`(`deviceToken`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Drop legacy FK iot_devices.tableId if exists
SET @fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'iot_devices'
    AND CONSTRAINT_NAME = 'iot_devices_tableId_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql := IF(@fk_exists > 0,
  'ALTER TABLE `iot_devices` DROP FOREIGN KEY `iot_devices_tableId_fkey`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop legacy unique index iot_devices.tableId if exists
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'iot_devices'
    AND INDEX_NAME = 'iot_devices_tableId_key'
);
SET @sql := IF(@idx_exists > 0,
  'DROP INDEX `iot_devices_tableId_key` ON `iot_devices`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Drop legacy column tableId if exists
SET @tableid_col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'iot_devices'
    AND COLUMN_NAME = 'tableId'
);
SET @sql := IF(@tableid_col_exists > 0,
  'ALTER TABLE `iot_devices` DROP COLUMN `tableId`',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Add new columns for single-gateway model (if missing)
ALTER TABLE `iot_devices`
  ADD COLUMN IF NOT EXISTS `isGateway` BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS `name` VARCHAR(191) NULL;

-- Create routes table for table->relay mapping.
-- Keep charset/collation on DB defaults to reduce FK collation mismatch risk.
CREATE TABLE IF NOT EXISTS `iot_relay_routes` (
  `id` VARCHAR(191) NOT NULL,
  `tableId` VARCHAR(191) NOT NULL,
  `relayChannel` INTEGER NOT NULL,
  `gpioPin` INTEGER NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `iot_relay_routes_tableId_key`(`tableId`),
  PRIMARY KEY (`id`)
);

-- Ensure FK exists only when compatible with existing `tables.id` definition.
SET @tables_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tables'
);

SET @tables_id_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tables'
    AND COLUMN_NAME = 'id'
);

SET @tables_id_type := (
  SELECT LOWER(COLUMN_TYPE)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'tables'
    AND COLUMN_NAME = 'id'
  LIMIT 1
);

SET @route_fk_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'iot_relay_routes'
    AND CONSTRAINT_NAME = 'iot_relay_routes_tableId_fkey'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);

SET @fk_safe := IF(
  @tables_exists > 0
  AND @tables_id_exists > 0
  AND @route_fk_exists = 0
  AND @tables_id_type = 'varchar(191)',
  1,
  0
);

SET @sql := IF(@fk_safe = 1,
  'ALTER TABLE `iot_relay_routes` ADD CONSTRAINT `iot_relay_routes_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
