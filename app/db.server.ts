import { PrismaClient } from "@prisma/client";

// Prisma client for Shopify session storage
// All application data is stored in DynamoDB via Lambda functions

const prisma = new PrismaClient();

export default prisma;
