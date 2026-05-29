import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cloakbrowser
const mockLaunch = vi.fn();
vi.mock("cloakbrowser", () => ({
  launch: mockLaunch,
}));

import { search_web } from "../../tools/searchWeb.js";

describe("searchWeb mocked reliability", () => {
  let mockPage;
  let mockBrowser;

  beforeEach(() => {
    mockLaunch.mockReset();
    mockPage = {
      goto: vi.fn(),
      waitForSelector: vi.fn(),
      $$eval: vi.fn(),
    };
    mockBrowser = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
    };
    mockLaunch.mockResolvedValue(mockBrowser);
  });

  it("caches query results and bypasses network on duplicate calls", async () => {
    mockPage.$$eval.mockResolvedValue([
      {
        title: "Test Title",
        href: "https://example.com",
        snippet: "Test Description",
      },
    ]);

    // Call 1
    const result1 = await search_web({ query: "duplicate query", max_results: 1 });
    expect(result1).toContain("Test Title");
    expect(mockLaunch).toHaveBeenCalledTimes(1);

    // Call 2
    const result2 = await search_web({ query: "duplicate query", max_results: 1 });
    expect(result2).toBe(result1);
    // Should still be 1 call because of caching
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent requests and enforces minimal delay", async () => {
    const callTimes = [];
    mockLaunch.mockImplementation(async () => {
      callTimes.push(Date.now());
      return mockBrowser;
    });
    mockPage.$$eval.mockResolvedValue([
      {
        title: "Serial Title",
        href: "https://example.com",
        snippet: "Serial Description",
      },
    ]);

    // Run multiple searches concurrently
    await Promise.all([
      search_web({ query: "query A", max_results: 1 }),
      search_web({ query: "query B", max_results: 1 }),
    ]);

    expect(mockLaunch).toHaveBeenCalledTimes(2);
    const timeDiff = callTimes[1] - callTimes[0];
    // Expected delay is at least 200ms
    expect(timeDiff).toBeGreaterThanOrEqual(180); // 20ms tolerance
  });

  it("retries on DDG anomaly/rate-limiting errors with backoff", async () => {
    // First call: goto throws error
    // Second call: succeeds
    let callCount = 0;
    mockLaunch.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        // Return a mock browser whose page throws an anomaly error
        const failPage = {
          goto: vi.fn().mockRejectedValue(new Error("DDG detected an anomaly")),
          waitForSelector: vi.fn(),
          $$eval: vi.fn(),
        };
        return {
          newPage: vi.fn().mockResolvedValue(failPage),
          close: vi.fn(),
        };
      } else {
        // Succeeds
        const successPage = {
          goto: vi.fn().mockResolvedValue(),
          waitForSelector: vi.fn().mockResolvedValue(),
          $$eval: vi.fn().mockResolvedValue([
            {
              title: "Retry Success Title",
              href: "https://example.com",
              snippet: "Success Description",
            },
          ]),
        };
        return {
          newPage: vi.fn().mockResolvedValue(successPage),
          close: vi.fn(),
        };
      }
    });

    const result = await search_web({ query: "retry query", max_results: 1 });
    expect(result).toContain("Retry Success Title");
    expect(mockLaunch).toHaveBeenCalledTimes(2);
  });
});
