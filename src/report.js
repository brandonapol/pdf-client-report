import { change, formatNumber, formatPct } from "./csv.js";
import { readMetrics } from "./exports.js";

export function draftReport({ client, period, csv, rows, previousCsv, preparedFor } = {}) {
  const metrics = readMetrics({ csv, rows, previousCsv });
  if (metrics.length === 0) {
    throw new Error(
      "No metrics found. Expected columns metric,value and optional previous,unit,note, or a platform export (GA4, Google Ads, Meta Ads, Mailchimp) with one column per metric.",
    );
  }

  const ranked = metrics
    .map((metric) => ({ ...metric, ...change(metric) }))
    .sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));
  const lead = ranked.find((metric) => metric.pct != null) ?? ranked[0];

  return {
    client: client?.trim() || "Client",
    period: period?.trim() || defaultPeriod(),
    preparedFor: preparedFor?.trim() || "",
    headline: headlineFor(lead),
    moved: ranked.slice(0, 3).map(movedLine),
    next: nextActions(ranked),
    metrics: ranked.map(presentMetric),
  };
}

function headlineFor(metric) {
  if (metric.pct == null) return `${metric.name} is the lead metric this week.`;
  const direction = metric.pct >= 0 ? "up" : "down";
  return `${metric.name} led the week, ${direction} ${formatPct(Math.abs(metric.pct)).replace("+", "")}.`;
}

function movedLine(metric) {
  if (metric.previous === 0) {
    return `${metric.name} went from 0 to ${formatNumber(metric.value)}${suffix(metric)}.`;
  }
  if (metric.pct == null) {
    return `${metric.name} is ${formatNumber(metric.value)}${suffix(metric)} with no prior week.`;
  }
  const direction = metric.pct >= 0 ? "up" : "down";
  const note = metric.note ? ` ${metric.note}` : "";
  return `${metric.name} ${direction} ${formatPct(Math.abs(metric.pct)).replace("+", "")} to ${formatNumber(metric.value)}${suffix(metric)}.${note}`;
}

function nextActions(metrics) {
  const actions = [];
  const missing = metrics.filter((metric) => metric.previous == null).map((metric) => metric.name);
  let askedForBaselines = false;
  for (const metric of metrics) {
    if (actions.length >= 3) break;
    if (metric.previous == null) {
      // One line for every missing baseline, so an export without last week doesn't fill the section with the same ask.
      if (!askedForBaselines) actions.push(`Add a prior-week baseline for ${namesList(missing)} before the next report.`);
      askedForBaselines = true;
    } else if (metric.pct <= -0.1) {
      actions.push(`Investigate the drop in ${metric.name} before next week's send.`);
    } else if (metric.pct >= 0.1) {
      actions.push(`Keep the budget or effort that lifted ${metric.name}.`);
    }
  }
  if (actions.length === 0) {
    actions.push("Hold the current mix. No metric moved more than 10%.");
  }
  return actions.slice(0, 3);
}

function namesList(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more metrics`;
}

function presentMetric(metric) {
  return {
    name: metric.name,
    value: metric.value,
    previous: metric.previous,
    delta: metric.delta,
    pct: metric.pct,
    unit: metric.unit,
    note: metric.note,
    valueLabel: `${formatNumber(metric.value)}${suffix(metric)}`,
    changeLabel: changeLabel(metric),
  };
}

function changeLabel(metric) {
  if (metric.previous == null) return "no baseline";
  if (metric.pct == null) return metric.delta === 0 ? "0%" : "new from 0";
  return formatPct(metric.pct);
}

function suffix(metric) {
  return metric.unit ? ` ${metric.unit}` : "";
}

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  return `Week of ${fmt.format(start)}`;
}
