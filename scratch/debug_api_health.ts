import { prisma } from "../src/lib/db/prisma";
import { TopicsService } from "../src/modules/knowledge/topics/topics-service";

async function debugApi() {
  const workspace = await prisma.workspace.findFirst({
    where: { slug: { not: "system" } },
    orderBy: { createdAt: 'desc' }
  });
  
  if (!workspace) return;
  const workspaceId = workspace.id;
  console.log(`Debugging for Workspace: ${workspaceId}`);

  const topics = await TopicsService.resolveWorkspaceTopics(workspaceId);
  const topicIds = topics.map(t => t.id);
  
  console.log(`Resolved ${topics.length} topics.`);
  
  const healthMetrics = await TopicsService.getTopicHealthMetrics(workspaceId, topicIds);
  
  const target = topics.find(t => t.key === 'access_control' || t.name.includes("Access Control"));
  if (target) {
    console.log(`Topic: ${target.name} (${target.id})`);
    console.log(`Health Metrics in API:`, healthMetrics[target.id]);
    
    // Manual check of associations for this specific topic and workspace
    const rawCount = await prisma.sourceChunkTopic.count({
        where: { topicId: target.id, workspaceId }
    });
    console.log(`Raw DB count for (topic: ${target.id}, ws: ${workspaceId}): ${rawCount}`);
  }

  process.exit(0);
}

debugApi().catch(console.error);
