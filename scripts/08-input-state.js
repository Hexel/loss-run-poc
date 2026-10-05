(() => {
  const selector = ':is(.form-field, .claim-field) :is(input[type="text"], input[type="date"], input[type="number"], textarea):not([readonly])';

  function syncDateDisplay(input) {
    if (!input.parentElement.classList.contains('formatted-date-control')) {
      const control = document.createElement('span');
      control.className = 'formatted-date-control';
      input.before(control);
      control.append(input);
      const display = document.createElement('span');
      display.className = 'formatted-date-value';
      display.setAttribute('aria-hidden', 'true');
      control.append(display);
    }
    const display = input.nextElementSibling;
    const [year, month, day] = input.value.split('-');
    const text = input.value ? `${Number(month)}/${Number(day)}/${year}` : '';
    if (display.textContent !== text) display.textContent = text;
  }

  function syncInputState(root) {
    const inputs = [...root.querySelectorAll(selector)];
    if (root instanceof Element && root.matches(selector)) inputs.unshift(root);
    for (const input of inputs) {
      input.removeAttribute('placeholder');
      input.classList.toggle('is-empty', input.value === '');
      if (input.type === 'date') syncDateDisplay(input);
    }
  }

  for (const eventName of ['input', 'change', 'focusin', 'focusout']) {
    document.addEventListener(eventName, event => {
      if (!(event.target instanceof Element) || !event.target.matches(selector)) return;
      syncInputState(document);
    });
  }
  document.addEventListener('reset', () => queueMicrotask(() => syncInputState(document)));

  new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) syncInputState(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  syncInputState(document);
})();
