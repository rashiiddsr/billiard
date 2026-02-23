import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ─── Users ────────────────────────────────────────────────────────────────
  const ownerHash = await bcrypt.hash('owner123', 12);
  const ownerPin = await bcrypt.hash('123456', 12);
  const managerHash = await bcrypt.hash('manager123', 12);
  const cashierHash = await bcrypt.hash('cashier123', 12);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@billiard.com' },
    update: {},
    create: {
      name: 'Ahmad Owner',
      email: 'owner@billiard.com',
      passwordHash: ownerHash,
      pin: ownerPin,
      role: "OWNER",
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@billiard.com' },
    update: {},
    create: {
      name: 'Budi Manager',
      email: 'manager@billiard.com',
      passwordHash: managerHash,
      role: "MANAGER",
    },
  });

  const cashier = await prisma.user.upsert({
    where: { email: 'cashier@billiard.com' },
    update: {},
    create: {
      name: 'Citra Kasir',
      email: 'cashier@billiard.com',
      passwordHash: cashierHash,
      role: "CASHIER",
    },
  });

  console.log('✅ Users created');

  // ─── Tables ───────────────────────────────────────────────────────────────
  const tables = [];
  for (let i = 1; i <= 10; i++) {
    const table = await prisma.table.upsert({
      where: { name: `Meja ${i}` },
      update: {},
      create: {
        name: `Meja ${i}`,
        description: `Billiard Table ${i}`,
        hourlyRate: i <= 5 ? 30000 : 40000,
      },
    });
    tables.push(table);
  }
  console.log('✅ 10 Tables created');

  // ─── IoT Single Gateway Device ────────────────────────────────────────────
  // New architecture: one ESP gateway controls all table relays.
  // Seed enforces a single IoT device and rotates gateway token on every seed run.
  await prisma.iotCommand.deleteMany();
  await prisma.iotRelayRoute.deleteMany();
  await prisma.iotDevice.deleteMany();

  const rawToken = `iot-gateway-secret-${crypto.randomBytes(8).toString('hex')}`;
  const tokenHash = await bcrypt.hash(rawToken, 10);

  const gatewayDevice = await prisma.iotDevice.create({
    data: {
      name: 'Main ESP Gateway',
      isGateway: true,
      deviceToken: tokenHash,
    },
  });

  // default route: table order -> relay channel 0..n
  for (let i = 0; i < tables.length; i++) {
    await prisma.iotRelayRoute.create({
      data: {
        tableId: tables[i].id,
        relayChannel: i,
        gpioPin: i,
      },
    });
  }

  console.log(`📱 IoT Gateway Device ID: ${gatewayDevice.id}`);
  console.log(`🔐 IoT Gateway raw token (save this!): ${rawToken}`);
  console.log('✅ Single IoT gateway device + relay routes created');

  // ─── Menu Items ───────────────────────────────────────────────────────────
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
    // Create stock record
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
    { name: 'Meja Billiard', category: 'Meja', qtyGood: 10, qtyBad: 0 },
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
  console.log('  Owner:   owner@billiard.com   / owner123   (PIN: 123456)');
  console.log('  Manager: manager@billiard.com / manager123');
  console.log('  Cashier: cashier@billiard.com / cashier123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
