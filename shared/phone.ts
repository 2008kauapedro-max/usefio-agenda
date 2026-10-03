export function normalizePhone(value?: string|null) {
  const digits=(value??'').replace(/\D/g,'');
  if(!digits) return '';
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export function whatsappUrl(value?: string|null) {
  const digits=normalizePhone(value);
  return digits ? `https://wa.me/${digits}` : null;
}
