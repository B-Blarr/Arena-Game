/**
 * HTML-Escaping fuer Nutzereingaben (Profilnamen), bevor sie per innerHTML
 * gerendert werden. Zentral, damit die Screens keine eigenen Kopien halten.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
