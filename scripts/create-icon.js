const fs = require('node:fs');
const path = require('node:path');
const pngToIcoModule = require('png-to-ico');
const pngToIco = pngToIcoModule.default ?? pngToIcoModule;

async function createIcon() {
  const root = path.join(__dirname, '..');
  const source = path.join(root, 'icon.png');
  const outputDirectory = path.join(root, 'build');
  const output = path.join(outputDirectory, 'icon.ico');

  fs.mkdirSync(outputDirectory, { recursive: true });
  const ico = await pngToIco(source);
  fs.writeFileSync(output, ico);
  console.log(`Created ${output}`);
}

createIcon().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
