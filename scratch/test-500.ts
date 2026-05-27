import { TrustProfileService } from "./src/modules/workspaces/trust-profile-service";
import { prisma } from "./src/lib/db/prisma";

async function test() {
    console.log("Testing TrustProfileService.updateProfile...");
    try {
        // Find a workspace to test with
        const workspace = await prisma.workspace.findFirst();
        const user = await prisma.user.findFirst();
        
        if (!workspace || !user) {
            console.log("No workspace or user found to test.");
            return;
        }

        console.log(`Using workspace: ${workspace.id}, user: ${user.id}`);

        await TrustProfileService.updateProfile(workspace.id, user.id, {
            industry: "software",
            productType: "saas",
            customerSegment: "b2b",
            dataTypes: ["PII"],
            complianceTargets: ["SOC2"]
        });

        console.log("Profile update successful!");
    } catch (err) {
        console.error("Profile update FAILED:", err);
    }
}

test().finally(() => prisma.$disconnect());
