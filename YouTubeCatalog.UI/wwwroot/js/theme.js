window.ytCatalogTheme = {
  applyTheme: (opts) => {
    try {
      const root = document.documentElement;
      root.style.setProperty('--brand-primary', opts.primary || '#0067C5');
      root.style.setProperty('--brand-secondary', opts.secondary || '#FF4081');
      root.style.setProperty('--surface-bg', opts.surface || '#FFFFFF');
      root.style.setProperty('--text-primary', opts.text || '#111827');
      root.style.setProperty('--base-font-scale', (opts.baseFontScale || 1).toString());

      if (opts.isDark) {
        root.setAttribute('data-theme', 'dark');
        document.querySelector('meta[name=theme-color]')?.setAttribute('content', opts.primary || '#0067C5');
      } else {
        root.setAttribute('data-theme', 'light');
        document.querySelector('meta[name=theme-color]')?.setAttribute('content', opts.surface || '#FFFFFF');
      }

      // persist preference
      try { localStorage.setItem('ytCatalog:theme', JSON.stringify(opts)); } catch (e) { /* ignore */ }
    } catch (err) {
      console.error('ytCatalogTheme.applyTheme', err);
    }
  },
  loadStored: () => {
    try {
      const raw = localStorage.getItem('ytCatalog:theme');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
};
