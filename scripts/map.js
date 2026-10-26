// Gera www/brazil-map.js a partir do pacote @svg-maps/brazil (CC BY 4.0)
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', '@svg-maps', 'brazil', 'index.js');
if (!fs.existsSync(src)) { console.log('mapa: pacote nao encontrado'); process.exit(0); }
const js = fs.readFileSync(src, 'utf8').replace(/^\s*export default/, 'window.BR_MAP =');
fs.writeFileSync(path.join(__dirname, '..', 'www', 'brazil-map.js'), '/* Mapa do Brasil: @svg-maps/brazil (CC BY 4.0) */\n' + js);
console.log('mapa gerado');
