export const REPORT_ACTIVITY_LOG_SETTING_VERSION = 1 as const;

export type ReportActivityLogEvent = {
  id: string;
  eventKey: string;
  label: string;
  at: string;
  actorName: string | null;
  actorEmail: string | null;
  reportVersionId: string | null;
  note: string | null;
};

export type ReportActivityLogSettingPayload = {
  version: typeof REPORT_ACTIVITY_LOG_SETTING_VERSION;
  events: ReportActivityLogEvent[];
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function toReportActivityLogSettingKey(reportingPeriodId: string) {
  return `report_activity_log_v1:${reportingPeriodId}`;
}

export function stringifyReportActivityLogSettingPayload(
  payload: ReportActivityLogSettingPayload
) {
  const normalizedEvents = payload.events
    .map((event) => ({
      id: normalizeText(event.id),
      eventKey: normalizeText(event.eventKey),
      label: normalizeText(event.label),
      at: normalizeText(event.at),
      actorName: normalizeText(event.actorName) || null,
      actorEmail: normalizeText(event.actorEmail) || null,
      reportVersionId: normalizeText(event.reportVersionId) || null,
      note: normalizeText(event.note) || null
    }))
    .filter((event) => event.id && event.eventKey && event.label && event.at);

  return JSON.stringify({
    version: REPORT_ACTIVITY_LOG_SETTING_VERSION,
    events: normalizedEvents
  });
}

export function parseReportActivityLogSettingPayload(rawValue: string | null | undefined) {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as {
      version?: unknown;
      events?: Array<{
        id?: unknown;
        eventKey?: unknown;
        label?: unknown;
        at?: unknown;
        actorName?: unknown;
        actorEmail?: unknown;
        reportVersionId?: unknown;
        note?: unknown;
      }>;
    };

    const version = Number(parsed.version);
    const events = (parsed.events ?? [])
      .map((event) => ({
        id: normalizeText(String(event.id ?? '')),
        eventKey: normalizeText(String(event.eventKey ?? '')),
        label: normalizeText(String(event.label ?? '')),
        at: normalizeText(String(event.at ?? '')),
        actorName: normalizeText(String(event.actorName ?? '')) || null,
        actorEmail: normalizeText(String(event.actorEmail ?? '')) || null,
        reportVersionId: normalizeText(String(event.reportVersionId ?? '')) || null,
        note: normalizeText(String(event.note ?? '')) || null
      }))
      .filter((event) => event.id && event.eventKey && event.label && event.at);

    return {
      version:
        Number.isInteger(version) && version === REPORT_ACTIVITY_LOG_SETTING_VERSION
          ? REPORT_ACTIVITY_LOG_SETTING_VERSION
          : REPORT_ACTIVITY_LOG_SETTING_VERSION,
      events
    };
  } catch {
    return null;
  }
}

