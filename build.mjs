/* build.mjs — bundle the app and all runtime dependencies into one HTML file */
import { build } from 'esbuild';
import fs from 'fs';
const out = process.argv[2] || 'dist/index.html';
const res = await build({ entryPoints: ['main.js'], bundle: true, format: 'iife', write: false, minify: false, legalComments: 'none', charset: 'utf8' });
const js = res.outputFiles[0].text;
const css = fs.readFileSync('style.css', 'utf8');
const manifest = fs.readFileSync('manifest.webmanifest', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');
if (js.includes('</script') || css.includes('</style')) throw new Error('unsafe closing tag inside inline asset');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="main.js"></script>', () => `<script>\n${js}\n</script>`);
fs.mkdirSync(out.substring(0, out.lastIndexOf('/')), { recursive: true });
fs.writeFileSync(out, html);
fs.writeFileSync(`${out.substring(0, out.lastIndexOf('/'))}/manifest.webmanifest`, manifest);
fs.writeFileSync(`${out.substring(0, out.lastIndexOf('/'))}/sw.js`, serviceWorker);
console.log('wrote', out, (html.length / 1024).toFixed(0) + ' KB');
