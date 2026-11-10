/*
 * Loads the simulation modules (no DOM) into globalThis.Racer, in dependency order.
 * The same files are loaded by index.html through <script> tags.
 */
'use strict';
const path = require('path');
const src = path.join(__dirname, '..', 'src');
for (const f of ['config', 'rng', 'track', 'car', 'collision', 'ai', 'race', 'loop']) {
  require(path.join(src, f + '.js'));
}
module.exports = globalThis.Racer;
