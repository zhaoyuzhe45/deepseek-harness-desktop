document.body.classList.add('settings-page');

async function initialize() {
  const value = await window.desktop.getCloseBehavior();
  document.querySelector(`input[value="${value}"]`).checked = true;
}

document.querySelector('#save').addEventListener('click', async () => {
  const selected = document.querySelector('input[name="behavior"]:checked');
  if (!selected) return;
  await window.desktop.setCloseBehavior(selected.value);
  const status = document.querySelector('#status');
  status.textContent = '设置已保存';
  setTimeout(() => { status.textContent = ''; }, 1800);
});

void initialize();
