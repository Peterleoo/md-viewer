import React, { useState, useEffect, useRef } from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import 'react-tabs/style/react-tabs.css';
import * as monaco from 'monaco-editor';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import './theme.css';
import * as api from './api';

// Helper to extract headings for outline
function extractOutline(mdContent) {
  const lines = mdContent.split('\n');
  const outline = [];
  lines.forEach((line, idx) => {
    const match = line.match(/^(#{1,6})\s+(.*)/);
    if (match) {
      const level = match[1].length;
      const text = match[2];
      outline.push({ level, text, line: idx });
    }
  });
  return outline;
}

function Outline({ outline, onSelect }) {
  return (
    <div style={{ padding: '8px', overflowY: 'auto', maxHeight: '100%' }}>
      {outline.map((item, i) => (
        <div
          key={i}
          style={{ marginLeft: (item.level - 1) * 12, cursor: 'pointer', padding: '2px 0' }}
          onClick={() => onSelect(item.line)}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}

function MonacoEditor({ value, onChange, theme }) {
  const ref = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!ref.current) return;
    const editor = monaco.editor.create(ref.current, {
      value,
      language: 'markdown',
      automaticLayout: true,
      theme: theme === 'dark' ? 'vs-dark' : 'vs-light',
      minimap: { enabled: false },
    });
    editorRef.current = editor;
    const disposer = editor.onDidChangeModelContent(() => {
      onChangeRef.current(editor.getValue());
    });
    return () => {
      disposer.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  useEffect(() => {
    monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs-light');
  }, [theme]);

  return <div ref={ref} style={{ height: '100%' }} />;
}

function App() {
  // ---------- State ----------
  const [tabs, setTabs] = useState([]); // {id, title, filePath, content}
  const [activeId, setActiveId] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const [lang, setLang] = useState('zh'); // placeholder, will be loaded from config
  const t = {
    zh: {
      newFile: '新建文件',
      open: '打开文件',
      save: '保存',
      exportPDF: '导出 PDF',
      exportHTML: '导出 HTML',
      toggleTheme: '切换主题',
      toggleLang: '切换语言/Toggle Language'
    },
    en: {
      newFile: 'New File',
      open: 'Open',
      save: 'Save',
      exportPDF: 'Export PDF',
      exportHTML: 'Export HTML',
      toggleTheme: 'Toggle Theme',
      toggleLang: 'Toggle Language/切换语言'
    }
  };
  // Load persisted language on first render
  useEffect(() => {
    (async () => {
      const savedLang = await api.getLang();
      if (savedLang) setLang(savedLang);
    })();
  }, []);
  const toggleLang = async () => {
    const newLang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    await api.setLang(newLang);
  };
  const previewRef = useRef(null);

  // ---------- Markdown Renderer ----------
  const md = useRef(new MarkdownIt({ html: true, linkify: true, typographer: true }).use((md) => {
    md.set({
      highlight: (str, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return `<pre class="hljs"><code>${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`;
          } catch (_) {}
        }
        return `<pre class="hljs"><code>${md.utils.escapeHtml(str)}</code></pre>`;
      }
    });
  })).current;

  // ---------- Theme handling ----------
  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme === 'light');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  // ---------- Session restore ----------
  useEffect(() => {
    const saved = localStorage.getItem('sessionTabs');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTabs(parsed);
        if (parsed.length) setActiveId(parsed[0].id);
      } catch (_) {}
    }
  }, []);

  // Save session on change
  useEffect(() => {
    localStorage.setItem('sessionTabs', JSON.stringify(tabs));
  }, [tabs]);

  // ---------- Autosave (5 s) ----------
  useEffect(() => {
    const interval = setInterval(() => {
      tabs.forEach((tab) => {
        if (tab.filePath) {
          api.saveFile({ filePath: tab.filePath, content: tab.content });
        }
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [tabs]);

  // ---------- Keyboard shortcuts ----------
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveFile();
      } else if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        openFile();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        exportPDF();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        exportHTML();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeId, tabs]);

  // ---------- File operations ----------
  const openFile = async () => {
    const result = await api.openFile();
    if (!result) return;
    const { filePath, content } = result;
    const id = Date.now() + Math.random();
    setTabs((prev) => [...prev, { id, title: pathBasename(filePath), filePath, content }]);
    setActiveId(id);
  };

  const saveFile = async () => {
    const tab = tabs.find((t) => t.id === activeId);
    if (!tab) return;
    const result = await api.saveFile({ filePath: tab.filePath, content: tab.content });
    if (result && result.filePath) {
      setTabs((prev) =>
        prev.map((t) => (t.id === tab.id ? { ...t, title: pathBasename(result.filePath), filePath: result.filePath } : t))
      );
    }
  };

  const exportPDF = async () => {
    const tab = tabs.find((t) => t.id === activeId);
    if (!tab) return;
    const html = md.render(tab.content);
    await api.exportPDF(html);
  };

  const exportHTML = async () => {
    const tab = tabs.find((t) => t.id === activeId);
    if (!tab) return;
    const html = md.render(tab.content);
    await api.saveHTML(html);
  };

  const updateContent = (id, newContent) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, content: newContent } : t)));
  };

  const closeTab = (id) => {
    setTabs((prev) => prev.filter((t) => t.id !== id));
    if (activeId === id) {
      const remaining = tabs.filter((t) => t.id !== id);
      setActiveId(remaining[0]?.id || null);
    }
  };

  const pathBasename = (p) => p.split(/[\\/]/).pop();

  const newFile = () => {
    const id = Date.now() + Math.random();
    setTabs((prev) => [...prev, { id, title: 'Untitled', filePath: null, content: '' }]);
    setActiveId(id);
  };

  // ---------- IPC menu actions ----------
  // Listen to menu actions emitted from the main process via preload API
  useEffect(() => {
    const offNew = window.electronAPI.on('menu-new-file', newFile);
    const offOpen = window.electronAPI.on('menu-open', openFile);
    const offSave = window.electronAPI.on('menu-save', saveFile);
    const offPdf = window.electronAPI.on('menu-export-pdf', exportPDF);
    const offHtml = window.electronAPI.on('menu-export-html', exportHTML);
    const offLang = window.electronAPI.on('menu-toggle-lang', toggleLang);
    return () => {
      offNew && offNew();
      offOpen && offOpen();
      offSave && offSave();
      offPdf && offPdf();
      offHtml && offHtml();
      offLang && offLang();
    };
  }, [activeId, tabs, lang]);

  // ---------- Outline handling ----------
  const currentTab = tabs.find((t) => t.id === activeId);
  const outline = currentTab ? extractOutline(currentTab.content) : [];
  const selectedIndex = Math.max(0, tabs.findIndex((t) => t.id === activeId));
  const scrollToLine = (line) => {
    if (!previewRef.current) return;
    const headings = previewRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const headingIndex = outline.findIndex((item) => item.line === line);
    if (headingIndex >= 0 && headings[headingIndex]) {
      headings[headingIndex].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ padding: '4px', background: '#f0f0f0', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button onClick={newFile}>{t[lang].newFile}</button>
        <button onClick={openFile}>{t[lang].open}</button>
        <button onClick={saveFile}>{t[lang].save}</button>
        <button onClick={exportPDF}>{t[lang].exportPDF}</button>
        <button onClick={exportHTML}>{t[lang].exportHTML}</button>
        <button onClick={toggleTheme}>{t[lang].toggleTheme} ({theme === 'light' ? '暗' : '亮'})</button>
          <button onClick={toggleLang}>{t[lang].toggleLang}</button>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex' }}>
        {/* Outline sidebar */}
        <div style={{ width: '200px', borderRight: '1px solid #ddd', overflow: 'auto' }}>
          <Outline outline={outline} onSelect={(line) => scrollToLine(line)} />
        </div>
        {/* Tabs and editors */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Tabs
            selectedIndex={selectedIndex}
            onSelect={(idx) => setActiveId(tabs[idx]?.id)}
          >
            <TabList>
              {tabs.map((tab) => (
                <Tab key={tab.id}>
                  {tab.title}
                  <span
                    style={{ marginLeft: '4px', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  >
                    ×
                  </span>
                </Tab>
              ))}
            </TabList>
            {tabs.map((tab) => (
              <TabPanel key={tab.id} style={{ display: 'flex', flex: 1, height: 'calc(100% - 2px)' }}>
                <div style={{ flex: 1, borderRight: '1px solid #ddd' }}>
                  <MonacoEditor value={tab.content} onChange={(v) => updateContent(tab.id, v)} theme={theme} />
                </div>
                <div
                  ref={previewRef}
                  className="preview"
                  style={{ flex: 1, padding: '8px', overflowY: 'auto' }}
                  dangerouslySetInnerHTML={{ __html: md.render(tab.content) }}
                />
              </TabPanel>
            ))}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

export default App;
