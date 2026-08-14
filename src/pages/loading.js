document.querySelector('#startup-minimize').addEventListener('click', () => {
  void window.desktop.minimizeStartup();
});

document.querySelector('#startup-close').addEventListener('click', () => {
  void window.desktop.closeStartup();
});
