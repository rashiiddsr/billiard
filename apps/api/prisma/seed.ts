import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const bayuHash = await bcrypt.hash('bayu123', 12);
  const apisHash = await bcrypt.hash('apis123', 12);
  const developerHash = await bcrypt.hash('developer123', 12);
  const ownerPin = await bcrypt.hash('123456', 12);

  const bayuOwner = await prisma.user.upsert({
    where: { email: 'bayu@billiard.com' },
    update: { name: 'bayu', phoneNumber: '082388112728', passwordHash: bayuHash, pin: ownerPin, role: Role.OWNER, isActive: true },
    create: { name: 'bayu', email: 'bayu@billiard.com', phoneNumber: '082388112728', passwordHash: bayuHash, pin: ownerPin, role: Role.OWNER },
  });

  await prisma.user.upsert({
    where: { email: 'apis@billiard.com' },
    update: { name: 'apis', phoneNumber: '081365657613', passwordHash: apisHash, pin: ownerPin, role: Role.OWNER, isActive: true },
    create: { name: 'apis', email: 'apis@billiard.com', phoneNumber: '081365657613', passwordHash: apisHash, pin: ownerPin, role: Role.OWNER },
  });

  await prisma.user.upsert({
    where: { email: 'developer.royal@billiard.com' },
    update: {
      name: 'developer royal',
      phoneNumber: '081200000000',
      passwordHash: developerHash,
      role: Role.DEVELOPER,
      isActive: true,
      pin: null,
    },
    create: {
      name: 'developer royal',
      email: 'developer.royal@billiard.com',
      phoneNumber: '081200000000',
      passwordHash: developerHash,
      role: Role.DEVELOPER,
      pin: null,
    },
  });

  await prisma.companyProfile.upsert({
    where: { id: 'default-company-profile' },
    update: {
      name: 'V-Luxe Billiard',
      address: 'Jl. Hangtuah, Babussalam, Kec. Mandau, Kabupaten Bengkalis, Riau 28784',
      phoneNumber: '085174388234',
      logoUrl: null,
    },
    create: {
      id: 'default-company-profile',
      name: 'V-Luxe Billiard',
      address: 'Jl. Hangtuah, Babussalam, Kec. Mandau, Kabupaten Bengkalis, Riau 28784',
      phoneNumber: '085174388234',
      logoUrl: null,
    },
  });

  console.log('✅ Users seeded');
  console.log('✅ Company profile seeded');
  console.log('✅ Tables default: 0 meja (buat via Developer > Manajemen Meja)');
  console.log('✅ IoT devices default: 0 device (buat via Developer > IoT Configurated)');

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
      update: { skuPrefix: category.skuPrefix, lastSkuNumber: category.lastSkuNumber },
      create: category,
    });
  }

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
      create: { ...item, changedById: bayuOwner.id },
    });

    await prisma.stockFnb.upsert({
      where: { menuItemId: menuItem.id },
      update: {},
      create: { menuItemId: menuItem.id, qtyOnHand: 50, lowStockThreshold: 5, trackStock: true },
    });
  }

  const assets = [
    { name: 'Meja Billiard', category: 'Meja', qtyGood: 15, qtyBad: 0 },
    { name: 'Stik Billiard', category: 'Stik', qtyGood: 28, qtyBad: 4 },
    { name: 'Bola Billiard Set', category: 'Bola', qtyGood: 9, qtyBad: 1 },
    { name: 'Segitiga (Rack)', category: 'Aksesoris', qtyGood: 10, qtyBad: 2 },
    { name: 'Kapur Stik', category: 'Aksesoris', qtyGood: 40, qtyBad: 0 },
  ];

  for (const asset of assets) {
    await prisma.operationalAsset.upsert({ where: { name: asset.name }, update: {}, create: asset });
  }

  console.log('\n🎉 Seed complete!');
  console.log('\n📋 Default credentials:');
  console.log('  Owner: bayu@billiard.com / bayu123 (No: 082388112728)');
  console.log('  Owner: apis@billiard.com / apis123 (No: 081365657613)');
  console.log('  Developer: developer.royal@billiard.com / developer123 (No: 081200000000)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
