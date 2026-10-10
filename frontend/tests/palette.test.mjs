import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { theme } from '../src/theme.ts';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function luminance(hex) {
  const normalized = hex.length === 4 ? '#' + [...hex.slice(1)].map((digit) => digit + digit).join('') : hex;
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(text, background) {
  const values = [luminance(text), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function token(name) {
  const value = css.match(new RegExp('--vmt-' + name + ':\\s*(#[a-f0-9]+)', 'i'))?.[1];
  if (!value) throw new Error('Missing palette token: ' + name);
  return value;
}

test('body and secondary text retain readable contrast on the canvas', () => {
  assert.ok(contrast(token('ink'), token('canvas')) >= 4.5);
  assert.ok(contrast(token('muted'), token('canvas')) >= 4.5);
});

for (const color of ['blue', 'teal']) test(color + ' primary buttons retain contrast with white labels', () => {
  const palette = theme.colors?.[color];
  if (!palette) throw new Error('Missing theme palette: ' + color);
  assert.ok(contrast('#fff', palette[6]) >= 4.5);
  assert.ok(contrast('#fff', palette[7]) >= 4.5);
});

for (const selector of ['section-heading', 'editor-panel-header']) test(selector + ' text stays readable across its gradient', () => {
  const block = css.slice(css.indexOf('.' + selector + ' {')).split('}')[0];
  const gradient = block.match(/background:\s*linear-gradient\(([^;]+)\)/)?.[1];
  assert.ok(gradient);
  const backgrounds = gradient.match(/#[a-f0-9]{6}/gi);
  const secondary = block.match(/--mantine-color-dimmed:\s*(#[a-f0-9]+)/i)[1];
  for (const background of backgrounds) {
    assert.ok(contrast('#fff', background) >= 4.5);
    assert.ok(contrast(secondary, background) >= 4.5);
    assert.ok(contrast('#b7ecea', background) >= 4.5);
  }
});
