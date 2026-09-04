import { z } from "zod";
import { google, type calendar_v3 } from "googleapis";
import type { AgentTool, ToolResult } from "./types";
import { getAuthorizedClient } from "./calendar-oauth";

// All four tools share a "not connected" failure mode, factored out here so
// each `execute` stays focused on its own logic. Typed as an explicit
// discriminated union (rather than returning a loosely-shaped object and
// casting call sites with `as any`) so every caller gets real type checking
// on `calendar`/`calendarId` after the `error` check narrows the union.
type CalendarHandle =
  | { ok: true; calendar: calendar_v3.Calendar; calendarId: string }
  | { ok: false; error: { ok: false; errorCode: string; humanSummary: string } };

async function requireCalendar(businessId: string): Promise<CalendarHandle> {
  const conn = await getAuthorizedClient(businessId);
  if (!conn) {
    return {
      ok: false,
      error: {
        ok: false,
        errorCode: "calendar_not_connected",
        humanSummary:
          "I'm not able to check the calendar right now — this business hasn't connected Google Calendar yet. I'll take your preferred time down and have someone confirm it with you.",
      },
    };
  }
  return { ok: true, calendar: google.calendar({ version: "v3", auth: conn.client }), calendarId: conn.calendarId };
}

// ---------------------------------------------------------------------------
// check_calendar_availability
// ---------------------------------------------------------------------------
const availabilityParams = z.object({
  startIso: z.string().datetime({ offset: true, message: "startIso must be a full ISO-8601 datetime, e.g. 2026-09-02T16:00:00+05:30" }),
  durationMinutes: z.number().int().min(5).max(480).default(30),
});
type AvailabilityParams = z.infer<typeof availabilityParams>;
interface AvailabilityResult {
  available: boolean;
  conflicts: { start: string; end: string; title: string }[];
}

export const checkCalendarAvailabilityTool: AgentTool<AvailabilityParams, AvailabilityResult> = {
  name: "check_calendar_availability",
  description:
    "Checks whether the business's Google Calendar is free for a given start time and duration. Always call this BEFORE offering to book or reschedule a specific slot — never assume a time is free.",
  parameters: availabilityParams,
  async execute({ startIso, durationMinutes }, ctx): Promise<ToolResult<AvailabilityResult>> {
    const handle = await requireCalendar(ctx.businessId);
    if (!handle.ok) return handle.error;
    const { calendar, calendarId } = handle;

    const start = new Date(startIso);
    const end = new Date(start.getTime() + durationMinutes * 60_000);

    try {
      const res = await calendar.freebusy.query({
        requestBody: {
          timeMin: start.toISOString(),
          timeMax: end.toISOString(),
          items: [{ id: calendarId }],
        },
      });
      const busy = res.data.calendars?.[calendarId]?.busy ?? [];
      const available = busy.length === 0;
      return {
        ok: true,
        data: {
          available,
          conflicts: busy.map((b) => ({ start: b.start!, end: b.end!, title: "Existing event" })),
        },
        humanSummary: available
          ? `${start.toLocaleString()} is free for ${durationMinutes} minutes.`
          : `${start.toLocaleString()} is not free — there's a conflicting event on the calendar.`,
      };
    } catch (err) {
      return {
        ok: false,
        errorCode: "calendar_api_error",
        humanSummary: "I had trouble reaching the calendar just now. Let me note your preferred time and follow up.",
      };
    }
  },
};

// ---------------------------------------------------------------------------
// create_calendar_event
// ---------------------------------------------------------------------------
const createEventParams = z.object({
  startIso: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(480).default(30),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(50).optional(),
});
type CreateEventParams = z.infer<typeof createEventParams>;
interface CreateEventResult {
  eventId: string;
  htmlLink: string;
  start: string;
  end: string;
}

export const createCalendarEventTool: AgentTool<CreateEventParams, CreateEventResult> = {
  name: "create_calendar_event",
  description:
    "Creates a new event on the business's Google Calendar. Only call this AFTER check_calendar_availability confirmed the slot is free and the customer has confirmed they want to book it.",
  parameters: createEventParams,
  async execute(params, ctx): Promise<ToolResult<CreateEventResult>> {
    const handle = await requireCalendar(ctx.businessId);
    if (!handle.ok) return handle.error;
    const { calendar, calendarId } = handle;

    const start = new Date(params.startIso);
    const end = new Date(start.getTime() + params.durationMinutes * 60_000);
    const descriptionLines = [
      params.description ?? "",
      params.customerName ? `Customer: ${params.customerName}` : "",
      params.customerPhone ? `Phone: ${params.customerPhone}` : "",
      `Booked via AI assistant · conversation ${ctx.conversationId}`,
    ].filter(Boolean);

    try {
      const res = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: params.title,
          description: descriptionLines.join("\n"),
          start: { dateTime: start.toISOString(), timeZone: ctx.timezone },
          end: { dateTime: end.toISOString(), timeZone: ctx.timezone },
        },
      });
      const event = res.data;
      return {
        ok: true,
        data: {
          eventId: event.id!,
          htmlLink: event.htmlLink!,
          start: event.start?.dateTime ?? start.toISOString(),
          end: event.end?.dateTime ?? end.toISOString(),
        },
        humanSummary: `Booked "${params.title}" for ${start.toLocaleString()}.`,
      };
    } catch (err) {
      return {
        ok: false,
        errorCode: "calendar_api_error",
        humanSummary: "I wasn't able to create the calendar event just now. I'll flag this for the team to book manually.",
      };
    }
  },
};

// ---------------------------------------------------------------------------
// update_calendar_event (reschedule)
// ---------------------------------------------------------------------------
const updateEventParams = z.object({
  eventId: z.string().min(1),
  newStartIso: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(5).max(480).default(30),
});
type UpdateEventParams = z.infer<typeof updateEventParams>;
interface UpdateEventResult {
  eventId: string;
  start: string;
  end: string;
}

export const updateCalendarEventTool: AgentTool<UpdateEventParams, UpdateEventResult> = {
  name: "update_calendar_event",
  description:
    "Reschedules an existing calendar event to a new start time. Requires the eventId from a prior create_calendar_event call (look it up from the conversation's action history) and should be preceded by check_calendar_availability for the new time.",
  parameters: updateEventParams,
  async execute(params, ctx): Promise<ToolResult<UpdateEventResult>> {
    const handle = await requireCalendar(ctx.businessId);
    if (!handle.ok) return handle.error;
    const { calendar, calendarId } = handle;

    const newStart = new Date(params.newStartIso);
    const newEnd = new Date(newStart.getTime() + params.durationMinutes * 60_000);

    try {
      const res = await calendar.events.patch({
        calendarId,
        eventId: params.eventId,
        requestBody: {
          start: { dateTime: newStart.toISOString(), timeZone: ctx.timezone },
          end: { dateTime: newEnd.toISOString(), timeZone: ctx.timezone },
        },
      });
      return {
        ok: true,
        data: { eventId: res.data.id!, start: res.data.start?.dateTime ?? newStart.toISOString(), end: res.data.end?.dateTime ?? newEnd.toISOString() },
        humanSummary: `Moved the appointment to ${newStart.toLocaleString()}.`,
      };
    } catch (err: any) {
      const notFound = err?.code === 404;
      return {
        ok: false,
        errorCode: notFound ? "event_not_found" : "calendar_api_error",
        humanSummary: notFound
          ? "I couldn't find that appointment on the calendar to reschedule it — could you confirm the original booking details?"
          : "I wasn't able to reschedule that just now. I'll flag this for the team.",
      };
    }
  },
};

// ---------------------------------------------------------------------------
// cancel_calendar_event
// ---------------------------------------------------------------------------
const cancelEventParams = z.object({ eventId: z.string().min(1) });
type CancelEventParams = z.infer<typeof cancelEventParams>;

export const cancelCalendarEventTool: AgentTool<CancelEventParams, { eventId: string }> = {
  name: "cancel_calendar_event",
  description: "Cancels/deletes an existing calendar event by its eventId.",
  parameters: cancelEventParams,
  async execute({ eventId }, ctx): Promise<ToolResult<{ eventId: string }>> {
    const handle = await requireCalendar(ctx.businessId);
    if (!handle.ok) return handle.error;
    const { calendar, calendarId } = handle;

    try {
      await calendar.events.delete({ calendarId, eventId });
      return { ok: true, data: { eventId }, humanSummary: "The appointment has been cancelled." };
    } catch (err: any) {
      const notFound = err?.code === 404 || err?.code === 410;
      return {
        ok: false,
        errorCode: notFound ? "event_not_found" : "calendar_api_error",
        humanSummary: notFound
          ? "I couldn't find that appointment on the calendar — it may already be cancelled."
          : "I wasn't able to cancel that just now. I'll flag this for the team.",
      };
    }
  },
};