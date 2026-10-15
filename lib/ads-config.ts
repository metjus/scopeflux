/** Fill in your own approved AdSense units. Rebuild after changing this file. */
export const adsConfig = {
  enabled: false,
  preview: false,
  publisherId: '', // ca-pub- followed by your 16-digit publisher ID
  slots: {top: '', bottom: ''},
};
export function validAdUnit(publisher: string, slot: string) {
  return /^ca-pub-\d{16}$/.test(publisher) && /^\d{1,20}$/.test(slot);
}
