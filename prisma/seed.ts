import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // Create a test user
    const testUser = await prisma.user.upsert({
        where: { email: 'test@example.com' },
        update: {},
        create: {
            email: 'test@example.com',
            name: 'Test User',
            password: '$2a$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDjPE9wK9vZPDlPUnhVKXrGvVniq', // "password"
        },
    });

    console.log({ testUser });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
