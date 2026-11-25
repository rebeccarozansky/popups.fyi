// Month arrows and tap-a-day for the vendor page's calendar (VendorCalendar.jsx),
// inlined at the end of it. Every month and every day's list is already in
// the page; this only shows and hides them.
(() => {
  const root = document.currentScript.parentElement;
  const months = [...root.querySelectorAll('[data-cal-month]')];
  const label = root.querySelector('[data-cal-label]');
  const prev = root.querySelector('[data-cal-prev]');
  const next = root.querySelector('[data-cal-next]');
  const upcoming = root.querySelector('[data-cal-upcoming]');
  const empty = root.querySelector('[data-cal-empty]');
  let current = Math.max(0, months.findIndex((month) => !month.hidden));
  let selected = null;

  // A day lists everything on it; tapping it again goes back to what's
  // coming up.
  function select(day) {
    selected = day;
    for (const button of root.querySelectorAll('[data-cal-date]')) {
      button.setAttribute('aria-pressed', String(button.dataset.calDate === day));
    }
    let found = false;
    for (const list of root.querySelectorAll('[data-cal-day]')) {
      list.hidden = list.dataset.calDay !== day;
      if (!list.hidden) found = true;
    }
    upcoming.hidden = day !== null;
    empty.hidden = day === null || found;
  }

  function show(index) {
    current = index;
    months.forEach((month, i) => {
      month.hidden = i !== index;
    });
    label.textContent = months[index].dataset.label;
    prev.setAttribute('aria-disabled', String(index === 0));
    next.setAttribute('aria-disabled', String(index === months.length - 1));
  }

  const step = (delta) => () => {
    const index = current + delta;
    if (index < 0 || index >= months.length) return;
    show(index);
    select(null);
  };
  prev.addEventListener('click', step(-1));
  next.addEventListener('click', step(1));
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cal-date]');
    if (button) select(button.dataset.calDate === selected ? null : button.dataset.calDate);
  });
  show(current);
})();
