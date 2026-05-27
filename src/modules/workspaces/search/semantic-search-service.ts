import { logger } from "@/lib/logging/logger";
import { SimilarityService } from "./similarity-service";

export interface SearchResult {
  chunkId: string;
  content: string;
  heading: string | null;
  docName: string;
  relevanceScore: number;
}


  /**
   * Performs semantic search for a query string within a specific workspace.
   */
export const SemanticSearchService = {
  /**
   * Performs semantic search for a query string within a specific workspace.
   * Now delegates to the unified SimilarityService.
   */
  async search(
    queryText: string,
    workspaceId: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    const matches = await SimilarityService.searchChunks(workspaceId, queryText, limit);
    
    return matches.map(m => ({
      chunkId: m.item.id,
      content: m.item.content,
      heading: m.item.heading,
      docName: m.item.sourceDocument.fileName,
      relevanceScore: m.score,
    }));
  }
};
