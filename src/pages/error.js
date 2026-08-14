const message = new URLSearchParams(location.search).get('message') || '未知错误';
document.querySelector('#message').textContent = message;
document.querySelector('#retry').addEventListener('click', async (event) => {
  event.currentTarget.disabled = true;
  await window.desktop.retryService();
});
