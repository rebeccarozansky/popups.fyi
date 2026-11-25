import { DateTime } from 'luxon';
import { dotColorFor } from '../components/CategoryBadge.jsx';
import ResidencyGlyph from '../components/ResidencyGlyph.jsx';
import { formatTimeRange } from '../lib/dateFilters.js';
import { isResidency, occurrencesBetween, residencyEntryNow } from '../lib/residencies.js';
import calendarScript from './calendarScript.js?raw';
import { LABEL_CLASS, Section } from './StaticPage.jsx';

// The vendor page's calendar: the app's Saved calendar (popups.fyi.app,
// SavedCalendar.jsx) with the vendor's dates in it. A month of days with a dot
// for each date, and the list of what's coming up - or of one day, once you
// tap it. Vendor pages ship without the app, so every month the arrows can
// reach and every day's list is rendered here, and calendarScript.js (inlined
// below) shows and hides them.
//
// The calendar starts this month and runs through the vendor's last listed
// pop-up, or RESIDENCY_WEEKS into a running residency, up to MAX_MONTHS. It
// opens on the month of their next date. `linkFor(item)` is the page a date
// links to, or null.

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const RESIDENCY_WEEKS = 8;
const MAX_MONTHS = 6;
const NAV_CLASS =
  'w-8 h-8 border border-hair flex items-center justify-center bg-white ' +
  'hover:bg-surfacealt active:bg-surfacealt aria-disabled:opacity-30 aria-disabled:hover:bg-white';

// Sunday-first weeks, as US wall calendars are.
function monthDays(month) {
  const gridStart = month.minus({ days: month.weekday % 7 });
  const weeks = Math.ceil(((month.weekday % 7) + month.daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => gridStart.plus({ days: i }));
}

export default function VendorCalendar({ popups, residencies, zone, now, linkFor }) {
  const today = now.setZone(zone);
  const todayKey = today.toISODate();
  const firstMonth = today.startOf('month');

  let lastMonth = firstMonth;
  const reach = (dt) => {
    lastMonth = DateTime.max(lastMonth, dt.setZone(zone).startOf('month'));
  };
  for (const popup of popups) if (popup.end > now) reach(popup.start);
  for (const res of residencies) {
    const next = residencyEntryNow(res, now);
    if (!next || next.end <= now) continue;
    const ahead = occurrencesBetween(res, next.start, next.start.plus({ weeks: RESIDENCY_WEEKS }));
    reach(ahead[ahead.length - 1].start);
  }
  lastMonth = DateTime.min(lastMonth, firstMonth.plus({ months: MAX_MONTHS - 1 }));

  const months = [];
  for (let month = firstMonth; month <= lastMonth; month = month.plus({ months: 1 })) {
    months.push({ month, key: month.toFormat('yyyy-MM'), days: monthDays(month) });
  }
  const from = months[0].days[0];
  const to = months[months.length - 1].days.at(-1).endOf('day');
  const shownDays = new Set(months.flatMap(({ days }) => days.map((day) => day.toISODate())));

  // Each pop-up once, and a residency once per date. Pop-ups further out
  // than the last month still go in the coming-up list.
  const entries = [
    ...popups
      .filter((p) => p.end > now || (p.start >= from && p.start <= to))
      .map((p) => ({ key: p.id, item: p, start: p.start, end: p.end })),
    ...residencies.flatMap((res) =>
      occurrencesBetween(res, from, to).map((occurrence) => ({
        key: `${res.id}@${occurrence.start.toFormat("yyyy-MM-dd'T'HH:mm")}`,
        item: { ...res, start: occurrence.start, end: occurrence.end, occurrences: [occurrence] },
        start: occurrence.start,
        end: occurrence.end,
      })),
    ),
  ].sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const byDay = new Map();
  for (const entry of entries) {
    const key = entry.start.toISODate();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(entry);
  }

  // What's coming up: every pop-up, and each residency once, at its next date
  // (the grid still dots all of them).
  const upcoming = new Map();
  const listed = new Set();
  for (const entry of entries) {
    if (entry.end < now) continue;
    if (isResidency(entry.item)) {
      if (listed.has(entry.item.id)) continue;
      listed.add(entry.item.id);
    }
    const key = entry.start.toISODate();
    if (!upcoming.has(key)) upcoming.set(key, []);
    upcoming.get(key).push(entry);
  }

  const nextDay = upcoming.keys().next().value;
  let initial = nextDay ? DateTime.fromISO(nextDay, { zone }).startOf('month') : firstMonth;
  if (initial > lastMonth) initial = lastMonth;
  const initialKey = initial.toFormat('yyyy-MM');

  const day = (key, list) => (
    <AgendaDay key={key} dayKey={key} list={list} todayKey={todayKey} zone={zone} now={now} linkFor={linkFor} />
  );

  return (
    <Section title="Calendar">
      <div className="mt-3 pb-1 flex items-center justify-between">
        {/* aria-disabled until the script decides: without it there's only
            the one month. */}
        <button type="button" data-cal-prev aria-disabled="true" aria-label="Previous month" className={NAV_CLASS}>
          <ChevronIcon direction="left" />
        </button>
        <div data-cal-label aria-live="polite" className="text-[14px] font-semibold text-ink">
          {initial.toFormat('LLLL yyyy')}
        </div>
        <button type="button" data-cal-next aria-disabled="true" aria-label="Next month" className={NAV_CLASS}>
          <ChevronIcon />
        </button>
      </div>

      {months.map(({ month, key, days }) => (
        <div key={key} data-cal-month={key} data-label={month.toFormat('LLLL yyyy')} hidden={key !== initialKey}>
          <div className="-mx-2 pb-3 grid grid-cols-7">
            {WEEKDAYS.map((label, i) => (
              <div key={i} aria-hidden="true" className="h-7 flex items-center justify-center text-[11px] text-faint">
                {label}
              </div>
            ))}
            {days.map((date) => {
              const dateKey = date.toISODate();
              const list = byDay.get(dateKey) || [];
              const isToday = dateKey === todayKey;
              return (
                <button
                  key={dateKey}
                  type="button"
                  data-cal-date={dateKey}
                  aria-pressed="false"
                  aria-label={`${date.toFormat('cccc, LLLL d')}${
                    list.length ? `, ${list.length} ${list.length === 1 ? 'pop-up' : 'pop-ups'}` : ''
                  }`}
                  className="group h-11 flex flex-col items-center justify-center"
                >
                  <span
                    className={
                      'w-7 h-7 flex items-center justify-center text-[13px] ' +
                      (date.month === month.month ? 'text-ink' : 'text-faint') +
                      (isToday ? ' font-semibold shadow-[inset_0_-2px_0_#0A1628]' : '') +
                      // The selected day (the script sets aria-pressed).
                      ' group-aria-pressed:bg-ink group-aria-pressed:text-white' +
                      ' group-aria-pressed:font-semibold group-aria-pressed:shadow-none'
                    }
                  >
                    {date.day}
                  </span>
                  <span aria-hidden="true" className="h-[5px] mt-0.5 flex gap-[3px]">
                    {list.slice(0, 3).map((entry) => (
                      <span
                        key={entry.key}
                        className="w-[5px] h-[5px] rounded-full"
                        style={{ background: dotColorFor(entry.item.categories?.[0]) }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="border-t border-hair">
        <div data-cal-upcoming>
          {upcoming.size > 0 ? (
            [...upcoming].map(([key, list]) => day(key, list))
          ) : (
            <p className="py-6 text-[13px] text-muted">Nothing coming up.</p>
          )}
        </div>
        {[...byDay]
          .filter(([key]) => shownDays.has(key))
          .map(([key, list]) => (
            <div key={key} data-cal-day={key} hidden>
              {day(key, list)}
            </div>
          ))}
        <p data-cal-empty hidden className="py-6 text-[13px] text-muted">
          Nothing on this day.
        </p>
      </div>
      <script dangerouslySetInnerHTML={{ __html: calendarScript }} />
    </Section>
  );
}

function AgendaDay({ dayKey, list, todayKey, zone, now, linkFor }) {
  return (
    <section>
      <h3 className={`pt-4 pb-1 ${LABEL_CLASS}`}>
        {dayKey === todayKey ? 'Today' : DateTime.fromISO(dayKey, { zone }).toFormat('cccc, LLL d')}
      </h3>
      <ul>
        {list.map((entry) => (
          <AgendaRow key={entry.key} item={entry.item} past={entry.end < now} path={linkFor(entry.item)} />
        ))}
      </ul>
    </section>
  );
}

// A row of the app's agenda, linking to the date's page when it has one.
function AgendaRow({ item, past, path }) {
  const body = (
    <>
      <span className="block text-[14px] font-semibold text-ink leading-tight">
        {item.name}
        {item.location_name && <span className="font-normal text-muted"> @ {item.location_name}</span>}
      </span>
      <span className="block mt-1 text-[13px] text-muted">
        {formatTimeRange(item)}
        {item.neighborhood && ` · ${item.neighborhood}`}
        {isResidency(item) && (
          <span className="ml-2 inline-block uppercase tracking-wide text-[11px] font-semibold text-ink border border-hair px-1.5 py-0.5">
            <ResidencyGlyph size={11} strokeWidth={1.6} className="inline-block mr-1 align-[-1px]" />
            Residency
          </span>
        )}
        {past && (
          <span className="ml-2 inline-block uppercase tracking-wide text-[11px] font-semibold text-faint border border-hair px-1.5 py-0.5">
            Already happened
          </span>
        )}
      </span>
    </>
  );
  return (
    <li className="border-b border-hair">
      {path ? (
        <a href={path} className="block py-3 hover:bg-surfacealt">
          {body}
        </a>
      ) : (
        <div className="py-3">{body}</div>
      )}
    </li>
  );
}

// The app's hand-drawn chevron (popups.fyi.app, AppIcons.jsx).
function ChevronIcon({ direction = 'right' }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0A1628"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={direction === 'left' ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M9.4 5.6 C 11.3 7.6 13.2 9.7 15 11.9 C 13.1 14.1 11.3 16.2 9.5 18.4" />
    </svg>
  );
}
