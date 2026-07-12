// Static PIX key configuration for manual (non-Mercado-Pago) deposits.
// The site owner checks their own bank account and approves deposits from the
// admin panel — same manual model already used for withdrawals.
export const PLATFORM_PIX_KEY = process.env.PLATFORM_PIX_KEY || 'jssthiagosantossantana@gmail.com';
export const PLATFORM_PIX_KEY_TYPE = process.env.PLATFORM_PIX_KEY_TYPE || 'email';
export const PLATFORM_PIX_HOLDER_NAME = process.env.PLATFORM_PIX_HOLDER_NAME || 'THIAGO SANTOS SANTANA';
export const PLATFORM_PIX_CITY = process.env.PLATFORM_PIX_CITY || 'SAO PAULO';

function emvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  crc &= 0xffff;
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Builds a static BR Code (PIX "Copia e Cola") EMV payload for a fixed amount.
export function generatePixBRCode(amount: number): string {
  const amountStr = amount.toFixed(2);
  const merchantAccountInfo = emvField('00', 'br.gov.bcb.pix') + emvField('01', PLATFORM_PIX_KEY);

  let payload =
    emvField('00', '01') +
    emvField('01', '11') +
    emvField('26', merchantAccountInfo) +
    emvField('52', '0000') +
    emvField('53', '986') +
    emvField('54', amountStr) +
    emvField('58', 'BR') +
    emvField('59', PLATFORM_PIX_HOLDER_NAME) +
    emvField('60', PLATFORM_PIX_CITY) +
    emvField('62', emvField('05', '***'));

  payload += '6304';
  return payload + crc16(payload);
}
