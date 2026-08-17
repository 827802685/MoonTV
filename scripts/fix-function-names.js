/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(p, out);
    } else if (e.name.endsWith('.func.js')) {
      out.push(p);
    }
  }
  return out;
}

function routeNameFor(funcPath) {
  const rel = path
    .relative(functionsRoot, funcPath)
    .replace(/\.func\.js$/, '')
    .replace(/\\/g, '/');
  return `app/${rel}/route`;
}

function vcConfigNameFor(funcPath) {
  const rel = path
    .relative(functionsRoot, funcPath)
    .replace(/\.func\.js$/, '')
    .replace(/\\/g, '/');
  return rel;
}

const functionsRoot = path.join(
  __dirname,
  '..',
  '.vercel',
  'output',
  'static',
  '_worker.js',
  '__next-on-pages-dist__',
  'functions'
);

const files = walk(functionsRoot, []);
let patched = 0;
for (const file of files) {
  const correctName = routeNameFor(file);
  const wrongName = 'app/api/admin/user/route';
  if (correctName === wrongName) continue;

  let c = fs.readFileSync(file, 'utf8');
  const before = c;
  c = c.split(wrongName).join(correctName);
  if (c !== before) {
    fs.writeFileSync(file, c);
    patched++;
    console.log(
      `patched: ${path.relative(functionsRoot, file)} -> ${correctName}`
    );
  }

  const vcConfig =
    file.replace(/\.func\.js$/, '.func') + path.sep + '.vc-config.json';
  if (fs.existsSync(vcConfig)) {
    const vc = JSON.parse(fs.readFileSync(vcConfig, 'utf8'));
    const correctVc = vcConfigNameFor(file);
    if (vc.name !== correctVc) {
      vc.name = correctVc;
      fs.writeFileSync(vcConfig, JSON.stringify(vc, null, 2));
      console.log(
        `patched vc-config: ${path.relative(
          functionsRoot,
          file
        )} -> ${correctVc}`
      );
    }
  }
}
console.log(`\nDone. Patched ${patched} function file(s).`);
