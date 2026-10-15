/** 儲存鍵名:網址帶 ?ns=xxx 時改用獨立的命名空間(測試用,不會動到正式存檔) */
const NS = (() => {
  try { return new URLSearchParams(location.search).get('ns') ?? ''; } catch { return ''; }
})();

export const storageKey = (key: string): string => (NS ? `${key}:${NS}` : key);
