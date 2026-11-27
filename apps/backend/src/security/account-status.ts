/** Single source of truth for "may this account use the API/sockets". */
export function isActiveUserStatus(status: unknown): boolean {
  return String(status ?? '').trim().toUpperCase() === 'ACTIVE';
}
