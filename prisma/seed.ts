import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with newly structured roles...');

  const password = await bcrypt.hash('admin123', 10);
  const managerPassword = await bcrypt.hash('manager123', 10);
  const ceoPassword = await bcrypt.hash('ceo123', 10);
  const sellerPassword = await bcrypt.hash('seller123', 10);
  const cashierPassword = await bcrypt.hash('cashier123', 10);
  const workerPassword = await bcrypt.hash('worker123', 10);
  const employeePassword = await bcrypt.hash('employee123', 10);

  // 1. Create Admin
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: password,
      role: Role.ADMIN,
    },
  });

  // 2. Create CEO (C-Level)
  const ceo = await prisma.user.upsert({
    where: { username: 'ceo' },
    update: {},
    create: {
      username: 'ceo',
      password: ceoPassword,
      role: Role.CEO,
    },
  });

  // 3. Create Manager
  const manager = await prisma.user.upsert({
    where: { username: 'manager' },
    update: {},
    create: {
      username: 'manager',
      password: managerPassword,
      role: Role.MANAGER,
    },
  });

  // 4. Create Groups (Flat Structure)
  const logisticsGroup = await prisma.group.upsert({
    where: { id: 'group-logistics' },
    update: { moderatorId: manager.id },
    create: {
      id: 'group-logistics',
      name: 'Logistika Bo\'limi',
      description: 'Yuk tashish va ombor boshqaruvi',
      moderatorId: manager.id,
    },
  });

  const securityGroup = await prisma.group.upsert({
    where: { id: 'group-security' },
    update: {},
    create: {
      id: 'group-security',
      name: 'Xavfsizlik Xizmati',
      description: 'Ob\'ektni qo\'riqlash va nazorat',
    },
  });

  // 5. Create Seller
  await prisma.user.upsert({
    where: { username: 'seller' },
    update: { groupId: logisticsGroup.id },
    create: {
      username: 'seller',
      password: sellerPassword,
      role: Role.SELLER,
      groupId: logisticsGroup.id,
    },
  });

  // 6. Create Cashier
  await prisma.user.upsert({
    where: { username: 'cashier' },
    update: { groupId: logisticsGroup.id },
    create: {
      username: 'cashier',
      password: cashierPassword,
      role: Role.CASHIER,
      groupId: logisticsGroup.id,
    },
  });

  // 7. Create Warehouse Worker
  await prisma.user.upsert({
    where: { username: 'worker' },
    update: { groupId: logisticsGroup.id },
    create: {
      username: 'worker',
      password: workerPassword,
      role: Role.WAREHOUSE_WORKER,
      groupId: logisticsGroup.id,
    },
  });

  // 8. Create Employee (Default role)
  await prisma.user.upsert({
    where: { username: 'employee' },
    update: { groupId: logisticsGroup.id },
    create: {
      username: 'employee',
      password: employeePassword,
      role: Role.EMPLOYEE,
      groupId: logisticsGroup.id,
    },
  });

  console.log('✅ Seeding Completed successfully.');
  console.log(`  Admin: admin / admin123`);
  console.log(`  CEO: ceo / ceo123`);
  console.log(`  Manager: manager / manager123`);
  console.log(`  Seller: seller / seller123`);
  console.log(`  Cashier: cashier / cashier123`);
  console.log(`  Warehouse Worker: worker / worker123`);
  console.log(`  Employee (Default): employee / employee123`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
