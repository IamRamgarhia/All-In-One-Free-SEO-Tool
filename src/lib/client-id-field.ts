/**
 * Reading the client id a tool form carried in.
 *
 * The write side is `<ClientIdField />`. The field name lives here so
 * the two cannot drift: a renamed input that nothing reads produces a
 * tool that silently records against no client, which is exactly the
 * failure the field exists to prevent.
 */

export const CLIENT_ID_FIELD = "clientId";

/**
 * The client id in a submitted form, or null.
 *
 * Null is a legitimate answer — a tool run from the generic /tools page
 * belongs to nobody — so this never throws. It only refuses values that
 * are not usable ids, because passing one through would trade a missing
 * attribution for a foreign-key error at insert time.
 */
export function clientIdFrom(formData: FormData): number | null {
  const raw = formData.get(CLIENT_ID_FIELD);
  if (typeof raw !== "string") return null;
  const id = Number.parseInt(raw.trim(), 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}
