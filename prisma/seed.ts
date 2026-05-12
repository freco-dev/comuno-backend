import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  console.log({ admin });

  // Create a sample group
  const group = await prisma.group.upsert({
    where: { id: 'sample-group-id' },
    update: {},
    create: {
      id: 'sample-group-id',
      name: 'General Branch',
      description: 'Main branch for all employees',
    },
  });

  console.log({ group });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
