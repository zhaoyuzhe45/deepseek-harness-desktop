const path = require('node:path');
const rcedit = require('rcedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const executable = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icon = path.join(context.packager.projectDir, 'build', 'icon.ico');
  await rcedit(executable, { icon });
};
