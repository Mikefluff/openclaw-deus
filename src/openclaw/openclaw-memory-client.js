class OpenClawMemoryClient {
  constructor(options = {}) {
    this.memorySearchTool =
      options.memorySearchTool ||
      (typeof memory_search !== "undefined" ? memory_search : undefined);
    this.memoryGetTool =
      options.memoryGetTool ||
      (typeof memory_get !== "undefined" ? memory_get : undefined);
  }

  async search(query, options = {}, fallbackSearch) {
    const { maxResults = 5, minScore = 0.7 } = options;

    if (this.memorySearchTool) {
      try {
        console.log(`[DEUS Memory] Using native memory_search: "${query}"`);
        const response = await this.memorySearchTool({
          query,
          maxResults,
          minScore,
        });

        if (response?.disabled) {
          console.log(
            "[DEUS Memory] Native memory_search disabled, using fallback",
          );
        } else if (Array.isArray(response?.results)) {
          return response.results;
        } else if (Array.isArray(response)) {
          return response;
        }
      } catch (error) {
        console.log(`[DEUS Memory] Native search failed: ${error.message}`);
      }
    }

    return fallbackSearch(query, maxResults);
  }

  async get(filePath, options = {}, fallbackGet) {
    const { from, lines } = options;

    if (this.memoryGetTool) {
      try {
        console.log(`[DEUS Memory] Using native memory_get: ${filePath}`);
        return await this.memoryGetTool({
          path: filePath,
          from,
          lines,
        });
      } catch (error) {
        console.log(`[DEUS Memory] Native get failed: ${error.message}`);
      }
    }

    return fallbackGet(filePath, from, lines);
  }
}

module.exports = { OpenClawMemoryClient };
