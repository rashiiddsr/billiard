-- DropForeignKey
ALTER TABLE `iot_devices` DROP FOREIGN KEY `iot_devices_tableId_fkey`;

-- DropIndex
DROP INDEX `iot_devices_tableId_key` ON `iot_devices`;

-- AlterTable
ALTER TABLE `iot_devices` DROP COLUMN `tableId`,
    ADD COLUMN `isGateway` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `name` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `iot_relay_routes` (
    `id` VARCHAR(191) NOT NULL,
    `tableId` VARCHAR(191) NOT NULL,
    `relayChannel` INTEGER NOT NULL,
    `gpioPin` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `iot_relay_routes_tableId_key`(`tableId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `iot_relay_routes` ADD CONSTRAINT `iot_relay_routes_tableId_fkey` FOREIGN KEY (`tableId`) REFERENCES `tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

