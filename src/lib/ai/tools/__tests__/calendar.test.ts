import { describe, it, expect } from "vitest";
import {
  checkCalendarAvailabilityTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  cancelCalendarEventTool,
} from "../calendar";
import { runTool } from "../registry";

// These tests exercise each tool's own Zod `parameters` schema directly —
// the same validation `runTool` runs before ever calling `execute` (and
// therefore before ever touching the Google Calendar API). They deliberately
// never call `execute`, so no network access or OAuth connection is needed
// to verify the input-validation guardrail actually rejects bad input.

describe("checkCalendarAvailabilityTool parameters", () => {
  it("accepts a full ISO-8601 datetime with an offset", () => {
    const result = checkCalendarAvailabilityTool.parameters.safeParse({
      startIso: "2026-09-03T16:00:00+05:30",
      durationMinutes: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a bare date with no time component — the model must resolve a full datetime, not a fuzzy date", () => {
    const result = checkCalendarAvailabilityTool.parameters.safeParse({ startIso: "2026-09-03" });
    expect(result.success).toBe(false);
  });

  it("rejects a duration outside the 5–480 minute bounds", () => {
    const tooLong = checkCalendarAvailabilityTool.parameters.safeParse({
      startIso: "2026-09-03T16:00:00+05:30",
      durationMinutes: 600,
    });
    expect(tooLong.success).toBe(false);

    const tooShort = checkCalendarAvailabilityTool.parameters.safeParse({
      startIso: "2026-09-03T16:00:00+05:30",
      durationMinutes: 1,
    });
    expect(tooShort.success).toBe(false);
  });

  it("defaults durationMinutes to 30 when omitted", () => {
    const result = checkCalendarAvailabilityTool.parameters.parse({ startIso: "2026-09-03T16:00:00+05:30" });
    expect(result.durationMinutes).toBe(30);
  });
});

describe("createCalendarEventTool parameters", () => {
  it("requires a non-empty title", () => {
    const result = createCalendarEventTool.parameters.safeParse({
      startIso: "2026-09-03T16:00:00+05:30",
      title: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional customer fields being omitted", () => {
    const result = createCalendarEventTool.parameters.safeParse({
      startIso: "2026-09-03T16:00:00+05:30",
      title: "Callback with Rahul",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateCalendarEventTool / cancelCalendarEventTool parameters", () => {
  it("update requires both eventId and newStartIso", () => {
    expect(updateCalendarEventTool.parameters.safeParse({ eventId: "abc123" }).success).toBe(false);
    expect(
      updateCalendarEventTool.parameters.safeParse({ eventId: "abc123", newStartIso: "2026-09-04T10:00:00+05:30" }).success
    ).toBe(true);
  });

  it("cancel rejects an empty eventId", () => {
    expect(cancelCalendarEventTool.parameters.safeParse({ eventId: "" }).success).toBe(false);
  });
});

describe("registry.runTool — argument validation happens before any tool executes", () => {
  it("returns a structured invalid_arguments error for bad args, without needing a Google connection", async () => {
    const result = await runTool(
      "check_calendar_availability",
      { startIso: "not-a-date" },
      { businessId: "biz-1", conversationId: "conv-1", timezone: "Asia/Kolkata", language: "en" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_arguments");
    }
  });

  it("returns unknown_tool for a tool name the model hallucinated", async () => {
    const result = await runTool(
      "delete_entire_calendar",
      {},
      { businessId: "biz-1", conversationId: "conv-1", timezone: "Asia/Kolkata", language: "en" }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("unknown_tool");
    }
  });
});
