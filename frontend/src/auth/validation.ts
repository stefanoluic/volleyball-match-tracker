const emailPattern = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;
const namePattern = /^\p{L}+(?:[ -]\p{L}+)*$/u;

export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Unesite mejl.';
  if (email.length > 254) return 'Mejl je predugačak.';
  if (!emailPattern.test(email)) return 'Unesite ispravnu mejl adresu, npr. ime@primer.com.';
}

export function normalizeName(value: string): string {
  return value.trim().normalize('NFC');
}

export function validateName(value: string, label: 'Ime' | 'Prezime'): string | undefined {
  const name = normalizeName(value);
  if (!name) return label === 'Ime' ? 'Unesite ime.' : 'Unesite prezime.';
  if (name.length > 100) return 'Najviše 100 znakova.';
  if (!namePattern.test(name)) return label + ' može da sadrži slova, uz razmak ili crticu između delova.';
}
