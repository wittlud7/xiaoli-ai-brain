// Work around directory copying failures in this Windows Node runtime when
// packaging Sites. Enable only for the publishing helper via NODE_OPTIONS.
const fs = require('node:fs');
const path = require('node:path');
const original = fs.cpSync;
if (process.platform === 'win32') {
  fs.cpSync = function copy(source, destination, options = {}) {
    const info = fs.lstatSync(source);
    if (info.isSymbolicLink()) throw new Error('Refusing to package a symlink');
    if (info.isDirectory()) {
      fs.mkdirSync(destination, { recursive: true });
      for (const name of fs.readdirSync(source)) copy(path.join(source, name), path.join(destination, name), options);
    } else if (info.isFile()) {
      fs.writeFileSync(destination, fs.readFileSync(source));
    } else return original(source, destination, options);
  };
}
