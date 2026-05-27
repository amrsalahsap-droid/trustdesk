import * as crypto from "crypto";

async function test() {
    console.log("Crypto test:", typeof crypto.createHash);
    try {
        const hash = crypto.createHash("sha256").update("hello world").digest("hex");
        console.log("Hash test:", hash);
    } catch (e) {
        console.error("Hash test failed:", e);
    }
}

test();
