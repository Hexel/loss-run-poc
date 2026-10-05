document.addEventListener('toggle', (event) => {
  const menu = event.target;
  if (!(menu instanceof HTMLElement) || !menu.matches('.policy-actions[popover]') || event.newState !== 'open') return;

  const trigger = document.querySelector(`[popovertarget="${CSS.escape(menu.id)}"]`);
  if (!trigger) return;
  const triggerBounds = trigger.getBoundingClientRect();
  const menuBounds = menu.getBoundingClientRect();
  const margin = 12;
  const left = Math.max(margin, Math.min(triggerBounds.right - menuBounds.width, window.innerWidth - menuBounds.width - margin));
  const top = Math.max(margin, Math.min(triggerBounds.bottom + 6, window.innerHeight - menuBounds.height - margin));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}, true);

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('.policy-actions button');
  if (!button || button.disabled) return;
  const menu = button.closest('.policy-actions');
  if (menu.matches(':popover-open')) {
    menu.hidePopover();
    document.querySelector(`[popovertarget="${CSS.escape(menu.id)}"]`)?.focus();
  }
}, true);