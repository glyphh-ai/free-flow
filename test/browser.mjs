// node test/browser.mjs : the game in a real (headless) browser, its files served from disk with no server and no
// port (test/page.mjs). The gear menu opens with the rider on the start line; picking gear rebuilds the rider and
// is kept; Drop in starts the countdown; the computer rides a whole hill for the player (?bot) to the results; and
// a phone gets the touch buttons. No errors in the page at any point. Screenshots land in test/shots/.
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { open, ROOT } from './page.mjs';

const SHOTS = path.join(ROOT, 'test', 'shots'); fs.mkdirSync(SHOTS, { recursive: true });
const ready = function (page) { return page.waitForFunction(function () { return window.ff && window.ff.ready; }, null, { timeout: 120000 }); };

// the menu, and gear
{
  const { browser, page, errors } = await open('/?seed=11&mute');
  await ready(page);
  assert(await page.isVisible('#menu'), 'the menu is up');
  await page.click('#o-who button:nth-child(2)');               // Dex
  await page.click('#o-wheels button:nth-child(3)');            // speed wheels
  await page.click('#o-vibe button:nth-child(2)');              // hype
  const g = await page.evaluate(function () { return JSON.parse(localStorage.getItem('ff-gear')); });
  assert.deepStrictEqual([g.who, g.wheels, g.vibe], ['dex', 'fast', 'hype'], 'the gear is kept');
  await page.screenshot({ path: path.join(SHOTS, 'menu.png') });
  await page.click('#ride');
  assert(await page.isHidden('#menu') && await page.isVisible('#hud'), 'racing');
  const t = await page.evaluate(function () { return window.ff.R.t; });
  assert(t < 0, 'the countdown first');
  // the player steers: holding right moves them right
  await page.waitForFunction(function () { return window.ff.R.t > 0.5; }, null, { timeout: 60000 });
  const d0 = await page.evaluate(function () { return window.ff.R.racers[0].d; });
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(function (d) { return window.ff.R.racers[0].d > d + 1; }, d0, { timeout: 60000 });
  await page.keyboard.up('ArrowRight');
  await page.screenshot({ path: path.join(SHOTS, 'race.png') });
  assert.deepStrictEqual(errors, []);
  await browser.close();
}

// the computer rides a whole hill
{
  const { browser, page, errors } = await open('/?seed=12&bot&mute&fast=10');
  await ready(page);
  await page.waitForSelector('#results:not(.hide)', { timeout: 280000 });
  const r = await page.evaluate(function () { const R = window.ff.R; return { place: R.racers[0].place, t: R.racers[0].finished, rows: document.querySelectorAll('#rtable tr').length }; });
  assert(r.t > 90 && r.t < 220 && r.rows === 6, JSON.stringify(r));
  await page.screenshot({ path: path.join(SHOTS, 'results.png') });
  await page.click('#again');
  assert(await page.isHidden('#results'), 'riding again');
  assert.deepStrictEqual(errors, []);
  await browser.close();
  console.log('   the bot finished ' + r.place + ' in ' + r.t.toFixed(1) + ' s');
}

// a phone
{
  const { browser, page, errors } = await open('/?seed=13&mute&go', { phone: true });
  await ready(page);
  assert(await page.isVisible('#ts'), 'the touch buttons');
  await page.waitForFunction(function () { return window.ff.R.t > 1; }, null, { timeout: 60000 });
  await page.screenshot({ path: path.join(SHOTS, 'phone.png') });
  assert.deepStrictEqual(errors, []);
  await browser.close();
}
console.log('OK browser: menu, gear kept, countdown, steering, a whole hill to the results, a phone');
