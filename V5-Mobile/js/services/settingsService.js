(function (F) {
  'use strict';
  const KEY = 'fuelflow_v5_language_v1';
  F.settingsService = {
    async getLanguage() {
      const saved = F.storage.read(KEY);
      const lang = saved?.language || F.storage.legacyLanguage();
      if (!['es', 'en', 'qu'].includes(lang)) return null;
      if (!saved) F.storage.write(KEY, { version: 1, language: lang });
      return lang;
    },
    async setLanguage(language) { return F.storage.write(KEY, { version: 1, language }); },
  };
})(globalThis.FuelFlow);
