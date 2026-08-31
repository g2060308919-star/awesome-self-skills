const openButton = document.querySelector("[data-open-dialog]");
const dialog = openButton
  ? document.getElementById(openButton.dataset.openDialog)
  : null;

openButton?.addEventListener("click", () => dialog?.showModal());
dialog?.querySelector("[data-close-dialog]")?.addEventListener("click", () => {
  dialog.close();
  openButton.focus();
});
dialog?.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

const tabs = [...document.querySelectorAll('[role="tab"]')];
for (const tab of tabs) {
  tab.addEventListener("click", () => {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(candidate.getAttribute("aria-controls"));
      if (panel) panel.hidden = !selected;
    }
    tab.focus();
  });
}

for (const form of document.querySelectorAll("form")) {
  form.addEventListener("submit", () => {
    form.setAttribute("aria-busy", "true");
    for (const button of form.querySelectorAll('button[type="submit"]')) {
      button.disabled = true;
    }
  });
}
