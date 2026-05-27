import { prisma } from "../src/lib/db/prisma";
import * as crypto from "crypto";

async function test() {
    console.log("Prisma Models Check:");
    try {
        const keys = Object.keys(prisma);
        console.log("Has embeddingCache:", keys.includes("embeddingCache"));
        console.log("Has sourceChunkTopic:", keys.includes("sourceChunkTopic"));
        
        const count = await (prisma as any).embeddingCache.count();
        console.log("Embedding Cache Count:", count);
    } catch (e) {
        console.error("Prisma check failed:", e.message);
    }
}

test();
