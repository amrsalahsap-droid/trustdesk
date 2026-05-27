import { prisma } from "./prisma";
import { EmbeddingService } from "../ai/embedding-service";

async function seedAnswerLibrary() {
    console.log("Seeding Answer Library...");
    
    try {
        const workspace = await prisma.workspace.findFirst();
        if (!workspace) throw new Error("No workspace found.");

        const mfaTopic = await prisma.knowledgeTopic.findFirst({ where: { key: 'mfa' } });
        const encTopic = await prisma.knowledgeTopic.findFirst({ where: { key: 'encryption_at_rest' } });

        const answers = [
            {
                title: "What is your MFA policy?",
                answer: "We require MFA for all employees using hardware tokens or authenticator apps.",
                topicId: mfaTopic?.id,
                status: 'APPROVED' as const
            },
            {
                title: "How is MFA enforced?",
                answer: "MFA is enforced globally via Okta and Azure AD policies.",
                topicId: mfaTopic?.id,
                status: 'DRAFT' as const
            },
            {
                title: "Data at rest encryption",
                answer: "All database volumes are encrypted using AWS KMS with AES-256.",
                topicId: encTopic?.id,
                status: 'APPROVED' as const
            }
        ];

        for (const a of answers) {
            const embedding = await EmbeddingService.getEmbedding(`${a.title} ${a.answer}`);
            await prisma.answerLibraryItem.create({
                data: {
                    workspaceId: workspace.id,
                    title: a.title,
                    answer: a.answer,
                    topicId: a.topicId,
                    status: a.status,
                    embedding,
                }
            });
        }

        console.log(`Successfully seeded ${answers.length} answers.`);
    } catch (err) {
        console.error("Answer seeding failed:", err);
    }
}

seedAnswerLibrary();
