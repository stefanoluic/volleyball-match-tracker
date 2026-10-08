import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeName, validateEmail, validateName } from '../src/auth/validation.ts';

for (const email of ['ime@primer.com', 'ime@tim.primer.rs', ' IME@PRIMER.COM ', 'ime@x.y']) {
  test('accepts email: ' + email, () => assert.equal(validateEmail(email), undefined));
}

for (const email of ['', 'ime@primer', 'ime@.com', 'ime@primer.', 'ime@primer..com',
  'ime@@primer.com', 'ime@primer .com', 'ime primer@primer.com', 'ime@']) {
  test('rejects email: ' + email, () => assert.ok(validateEmail(email)));
}

for (const name of ['Stefan', 'ČĆŠĐŽčćšđž', 'Стефан', 'Олуић', ' Z\u030Celjko ',
  'Ana Marija', 'Petrović-Jovanović', 'Ana-Marija Petrović', 'Ана Марија']) {
  test('accepts name: ' + name, () => {
    assert.equal(validateName(name, 'Ime'), undefined);
    assert.equal(validateName(name, 'Prezime'), undefined);
  });
}

for (const name of ['', '   ', 'Stefan2', 'Oluic!', "O'Neil", '🙂', '-', '-Stefan', 'Oluic-', 'Ana--Marija']) {
  test('rejects invalid name: ' + name, () => {
    assert.ok(validateName(name, 'Ime'));
    assert.ok(validateName(name, 'Prezime'));
  });
}

test('enforces name and email length limits', () => {
  assert.ok(validateName('a'.repeat(101), 'Ime'));
  assert.ok(validateEmail('a'.repeat(250) + '@x.rs'));
});

test('normalizes surrounding whitespace and decomposed accents', () => {
  assert.equal(normalizeName(' Z\u030Celjko '), 'Željko');
});
