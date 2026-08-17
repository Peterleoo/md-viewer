// Simple wrapper around the Electron preload API.
export const openFile = () => window.electronAPI.openFile();
export const saveFile = (data) => window.electronAPI.saveFile(data);
export const exportPDF = (html) => window.electronAPI.exportPDF(html);
export const saveHTML = (html) => window.electronAPI.saveHTML(html);
export const getLang = () => window.electronAPI.getLang();
export const setLang = (lang) => window.electronAPI.setLang(lang);
