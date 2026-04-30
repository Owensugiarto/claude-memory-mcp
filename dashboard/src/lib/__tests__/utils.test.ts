import { describe, it, expect, vi, afterEach } from "vitest";
import {
  formatRelativeTime,
  formatDate,
  formatTime,
  groupByDate,
  sourceLabel,
  projectLabel,
  truncate,
} from "../utils";

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for < 1 minute ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:30Z"));
    expect(formatRelativeTime("2026-04-30T12:00:00Z")).toBe("just now");
  });

  it("returns minutes for < 60 minutes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:05:00Z"));
    expect(formatRelativeTime("2026-04-30T12:00:00Z")).toBe("5m ago");
  });

  it("returns hours for < 24 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T15:00:00Z"));
    expect(formatRelativeTime("2026-04-30T12:00:00Z")).toBe("3h ago");
  });

  it("returns days for < 7 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-02T12:00:00Z"));
    expect(formatRelativeTime("2026-04-30T12:00:00Z")).toBe("2d ago");
  });

  it("returns formatted date for >= 7 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00Z"));
    const result = formatRelativeTime("2026-04-30T12:00:00Z");
    // Should be a short date like "Apr 30"
    expect(result).toMatch(/Apr\s+30/);
  });
});

describe("formatDate", () => {
  it("formats date as 'Mon DD, YYYY'", () => {
    const result = formatDate("2026-04-30T12:00:00Z");
    expect(result).toMatch(/Apr\s+30,\s+2026/);
  });
});

describe("formatTime", () => {
  it("formats time with hour and minutes", () => {
    const result = formatTime("2026-04-30T14:30:00Z");
    // Locale-dependent, but should contain a colon and digits
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("groupByDate", () => {
  it("groups items by updated_at date", () => {
    const items = [
      { id: 1, updated_at: "2026-04-30T10:00:00Z" },
      { id: 2, updated_at: "2026-04-30T15:00:00Z" },
      { id: 3, updated_at: "2026-04-29T10:00:00Z" },
    ];

    const groups = groupByDate(items);
    // Should have 2 groups (Apr 30 and Apr 29)
    expect(groups.size).toBe(2);

    // Each group should have the right number of items
    const values = Array.from(groups.values());
    const lengths = values.map((v) => v.length).sort();
    expect(lengths).toEqual([1, 2]);
  });

  it("falls back to timestamp field", () => {
    const items = [{ id: 1, timestamp: "2026-04-30T10:00:00Z" }];
    const groups = groupByDate(items);
    expect(groups.size).toBe(1);
  });

  it("handles empty array", () => {
    const groups = groupByDate([]);
    expect(groups.size).toBe(0);
  });
});

describe("sourceLabel", () => {
  it("maps claude_code to 'Claude Code'", () => {
    expect(sourceLabel("claude_code")).toBe("Claude Code");
  });

  it("maps claude_ai to 'Claude.ai'", () => {
    expect(sourceLabel("claude_ai")).toBe("Claude.ai");
  });

  it("passes through unknown sources", () => {
    expect(sourceLabel("other")).toBe("other");
  });
});

describe("projectLabel", () => {
  it("returns 'No project' for null", () => {
    expect(projectLabel(null)).toBe("No project");
  });

  it("strips C-- prefix and converts dashes to slashes", () => {
    expect(projectLabel("C--Users-Owen-dev")).toBe("Users/Owen/dev");
  });

  it("handles projects without C-- prefix", () => {
    expect(projectLabel("my-project")).toBe("my/project");
  });
});

describe("truncate", () => {
  it("returns text unchanged if within limit", () => {
    expect(truncate("short", 10)).toBe("short");
  });

  it("returns text unchanged if exactly at limit", () => {
    expect(truncate("12345", 5)).toBe("12345");
  });

  it("truncates and adds ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hello...");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });
});
