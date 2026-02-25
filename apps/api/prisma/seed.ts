import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Users ────────────────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash('owner123', 12);
  const ownerPin = await bcrypt.hash('123456', 12);
  const developerHash = await bcrypt.hash('developer123', 12);
  const managerHash = await bcrypt.hash('manager123', 12);
  const cashierHash = await bcrypt.hash('cashier123', 12);

  await prisma.user.upsert({
    where: { email: 'owner@billiard.com' },
    update: {
      name: 'Ahmad Owner',
      passwordHash: ownerHash,
      pin: ownerPin,
      role: Role.OWNER,
      isActive: true,
    },
    create: {
      name: 'Ahmad Owner',
      email: 'owner@billiard.com',
      passwordHash: ownerHash,
      pin: ownerPin,
      role: Role.OWNER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'developer@billiard.com' },
    update: {
      name: 'Danu Developer',
      passwordHash: developerHash,
      role: Role.DEVELOPER,
      isActive: true,
    },
    create: {
      name: 'Danu Developer',
      email: 'developer@billiard.com',
      passwordHash: developerHash,
      role: Role.DEVELOPER,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@billiard.com' },
    update: {
      name: 'Budi Manager',
      passwordHash: managerHash,
      role: Role.MANAGER,
      isActive: true,
    },
    create: {
      name: 'Budi Manager',
      email: 'manager@billiard.com',
      passwordHash: managerHash,
      role: Role.MANAGER,
    },
  });

  await prisma.user.upsert({
    where: { email: 'cashier@billiard.com' },
    update: {
      name: 'Citra Kasir',
      passwordHash: cashierHash,
      role: Role.CASHIER,
      isActive: true,
    },
    create: {
      name: 'Citra Kasir',
      email: 'cashier@billiard.com',
      passwordHash: cashierHash,
      role: Role.CASHIER,
    },
  });

  console.log('✅ Users seeded');

  // ─── Tables (stable IDs, default 15) ──────────────────────────────────────
  for (let i = 1; i <= 15; i++) {
    const relay = i - 1;
    await prisma.table.upsert({
      where: { id: `table-${String(i).padStart(2, '0')}` },
      update: {
        name: `Meja ${i}`,
        description: `Billiard Table ${i}`,
        hourlyRate: 30000,
        relayChannel: relay,
        gpioPin: relay,
      },
      create: {
        id: `table-${String(i).padStart(2, '0')}`,
        name: `Meja ${i}`,
        description: `Billiard Table ${i}`,
        hourlyRate: 30000,
        relayChannel: relay,
        gpioPin: relay,
      },
    });
  }
  console.log('✅ 15 default tables seeded (ID stabil)');

  // ─── IoT Single Gateway Device (stable ID, token rotated) ─────────────────
  await prisma.iotCommand.deleteMany();

  const gatewayDeviceId = 'iot-gateway-01';
  const rawToken = `iot-gateway-secret-${crypto.randomBytes(8).toString('hex')}`;
  const tokenHash = await bcrypt.hash(rawToken, 10);

  await prisma.iotDevice.upsert({
    where: { id: gatewayDeviceId },
    update: {
      deviceToken: tokenHash,
      isOnline: false,
      signalStrength: null,
    },
    create: {
      id: gatewayDeviceId,
      deviceToken: tokenHash,
      isOnline: false,
    },
  });

  // cleanup other historical devices so only stable gateway remains
  await prisma.iotDevice.deleteMany({
    where: { id: { not: gatewayDeviceId } },
  });

  console.log(`📱 IoT Gateway Device ID (stabil): ${gatewayDeviceId}`);
  console.log(`🔐 IoT Gateway raw token baru (save this!): ${rawToken}`);
  console.log('✅ Single IoT gateway seeded');

  // ─── Menu Items ───────────────────────────────────────────────────────────
  const defaultCategories = [
    { name: 'Minuman', skuPrefix: 'BEV', lastSkuNumber: 6 },
    { name: 'Snack', skuPrefix: 'SNK', lastSkuNumber: 5 },
    { name: 'Makanan', skuPrefix: 'MLS', lastSkuNumber: 5 },
    { name: 'Dessert', skuPrefix: 'DSS', lastSkuNumber: 2 },
    { name: 'Rokok', skuPrefix: 'CIG', lastSkuNumber: 2 },
  ];

  for (const category of defaultCategories) {
    await prisma.menuCategory.upsert({
      where: { name: category.name },
      update: {
        skuPrefix: category.skuPrefix,
        lastSkuNumber: category.lastSkuNumber,
      },
      create: category,
    });
  }

  console.log('✅ Default menu categories created');

  const menuItems = [
    { sku: 'BEV-001', name: 'Es Teh Manis', category: 'Minuman', price: 5000, cost: 2000 },
    { sku: 'BEV-002', name: 'Es Jeruk', category: 'Minuman', price: 7000, cost: 3000 },
    { sku: 'BEV-003', name: 'Air Mineral', category: 'Minuman', price: 4000, cost: 1500 },
    { sku: 'BEV-004', name: 'Kopi Hitam', category: 'Minuman', price: 8000, cost: 3000 },
    { sku: 'BEV-005', name: 'Kopi Susu', category: 'Minuman', price: 12000, cost: 5000 },
    { sku: 'BEV-006', name: 'Jus Alpukat', category: 'Minuman', price: 15000, cost: 6000 },
    { sku: 'SNK-001', name: 'Roti Bakar', category: 'Snack', price: 12000, cost: 5000 },
    { sku: 'SNK-002', name: 'Indomie Goreng', category: 'Snack', price: 10000, cost: 4000 },
    { sku: 'SNK-003', name: 'Kentang Goreng', category: 'Snack', price: 15000, cost: 6000 },
    { sku: 'SNK-004', name: 'Pisang Goreng', category: 'Snack', price: 10000, cost: 3000 },
    { sku: 'SNK-005', name: 'Singkong Goreng', category: 'Snack', price: 8000, cost: 2500 },
    { sku: 'MLS-001', name: 'Nasi Goreng', category: 'Makanan', price: 20000, cost: 10000 },
    { sku: 'MLS-002', name: 'Mie Goreng', category: 'Makanan', price: 18000, cost: 8000 },
    { sku: 'MLS-003', name: 'Nasi Kuning', category: 'Makanan', price: 15000, cost: 7000 },
    { sku: 'MLS-004', name: 'Ayam Bakar', category: 'Makanan', price: 25000, cost: 12000 },
    { sku: 'MLS-005', name: 'Sate Ayam', category: 'Makanan', price: 22000, cost: 10000 },
    { sku: 'DSS-001', name: 'Es Krim', category: 'Dessert', price: 10000, cost: 4000 },
    { sku: 'DSS-002', name: 'Puding', category: 'Dessert', price: 8000, cost: 3000 },
    { sku: 'CIG-001', name: 'Rokok Sampoerna', category: 'Rokok', price: 25000, cost: 20000 },
    { sku: 'CIG-002', name: 'Rokok Gudang Garam', category: 'Rokok', price: 22000, cost: 17000 },
  ];

  for (const item of menuItems) {
    const menuItem = await prisma.menuItem.upsert({
      where: { sku: item.sku },
      update: {},
      create: {
        ...item,
        price: item.price,
        cost: item.cost,
        changedById: manager.id,
      },
    });
    await prisma.stockFnb.upsert({
      where: { menuItemId: menuItem.id },
      update: {},
      create: {
        menuItemId: menuItem.id,
        qtyOnHand: 50,
        lowStockThreshold: 5,
        trackStock: true,
      },
    });
  }
  console.log('✅ 20 Menu items + stock created');

  // ─── Operational Assets ───────────────────────────────────────────────────
  const assets = [
    { name: 'Meja Billiard', category: 'Meja', qtyGood: 15, qtyBad: 0 },
    { name: 'Stik Billiard', category: 'Stik', qtyGood: 28, qtyBad: 4 },
    { name: 'Bola Billiard Set', category: 'Bola', qtyGood: 9, qtyBad: 1 },
    { name: 'Segitiga (Rack)', category: 'Aksesoris', qtyGood: 10, qtyBad: 2 },
    { name: 'Kapur Stik', category: 'Aksesoris', qtyGood: 40, qtyBad: 0 },
  ];

  for (const asset of assets) {
    await prisma.operationalAsset.upsert({
      where: { name: asset.name },
      update: {},
      create: asset,
    });
  }
  console.log('✅ Operational assets created');

  console.log('\n🎉 Seed complete!');
  console.log('\n📋 Default credentials:');
  console.log('  Owner:     owner@billiard.com     / owner123     (PIN: 123456)');
  console.log('  Developer: developer@billiard.com / developer123');
  console.log('  Manager:   manager@billiard.com   / manager123');
  console.log('  Cashier:   cashier@billiard.com   / cashier123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
