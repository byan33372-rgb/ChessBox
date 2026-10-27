import { randomBytes, randomUUID, createHash } from 'crypto';

/** 房间 ID：去掉易混淆字符的 30 字符表，10 位 ≈ 49 bit 熵，不可预测 */
const ROOM_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newRoomId(len = 10): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ROOM_ALPHABET[bytes[i] % ROOM_ALPHABET.length];
  return out;
}

/** 玩家会话令牌：192 bit，仅存其 SHA-256 到数据库，日志中只出现前 6 位 */
export function newSessionToken(): string {
  return randomBytes(24).toString('base64url');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function newRequestId(): string {
  return randomUUID();
}

const NICKS = ['青山', '流水', '松风', '竹影', '明月', '清风', '疏影', '暗香', '飞雪', '孤舟', '听雨', '观棋'];

export function randomNick(): string {
  return NICKS[randomBytes(1)[0] % NICKS.length];
}
