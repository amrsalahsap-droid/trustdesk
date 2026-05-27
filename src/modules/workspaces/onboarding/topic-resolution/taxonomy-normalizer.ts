export class TaxonomyNormalizer {
  /**
   * Cleans, trims, lowercases, and formats keys to be standard snake_case
   */
  static normalizeKey(key: string): string {
    if (!key) return "";
    
    let cleaned = key.trim().toLowerCase();
    
    // Replace dashes and spaces with underscores
    cleaned = cleaned.replace(/[-\s]+/g, "_");
    
    // Remove common prefixes/suffixes
    cleaned = cleaned.replace(/^(topic|risk|capability|claim)_/, "");
    cleaned = cleaned.replace(/_(topic|risk|capability|claim)$/, "");
    
    // Handle common plural variations
    if (cleaned === "subprocessor") cleaned = "subprocessors";
    if (cleaned === "backup") cleaned = "backups";
    if (cleaned === "credential") cleaned = "credentials";
    if (cleaned === "role") cleaned = "roles";
    if (cleaned === "user") cleaned = "users";
    
    return cleaned;
  }
}
