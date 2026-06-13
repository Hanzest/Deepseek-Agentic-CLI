import { useAppContext } from '../../context/AppContext';

interface ShortcutGroup {
  title: string;
  items: { keys: string; desc: string }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Navigation',
    items: [
      { keys: 'Ctrl+B', desc: 'Toggle sidebar' },
      { keys: 'a / ←', desc: 'Previous step (flashcard/tab/quiz/slide)' },
      { keys: 'd / →', desc: 'Next step (flashcard/tab/quiz/slide)' },
    ],
  },
  {
    title: 'Actions',
    items: [
      { keys: 'r', desc: 'Rename current page' },
      { keys: 'Delete', desc: 'Remove current page' },
    ],
  },
  {
    title: 'General',
    items: [
      { keys: '?', desc: 'Toggle this shortcuts overlay' },
      { keys: 'Esc', desc: 'Close overlay / cancel editing' },
      { keys: '/', desc: 'Focus search bar' },
    ],
  },
];

const s = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    animation: 'fadeIn 200ms ease',
  } as React.CSSProperties,
  card: {
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    borderRadius: 16,
    boxShadow: 'var(--shadow-lg)',
    width: '90%',
    maxWidth: 420,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    animation: 'slideUp 250ms ease',
  } as React.CSSProperties,
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid var(--border-color)',
  } as React.CSSProperties,
  title: {
    fontSize: '1.25rem',
    fontWeight: 700,
    margin: 0,
  } as React.CSSProperties,
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: '1.25rem',
    cursor: 'pointer',
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    transition: 'background var(--transition-fast), color var(--transition-fast)',
  } as React.CSSProperties,
  body: {
    padding: '1.25rem 1.5rem',
    overflowY: 'auto' as const,
    flex: 1,
  } as React.CSSProperties,
  group: {
    marginBottom: '1.25rem',
  } as React.CSSProperties,
  groupTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: 'var(--text-muted)',
    marginBottom: '0.625rem',
    paddingBottom: '0.375rem',
    borderBottom: '1px solid var(--border-color)',
  } as React.CSSProperties,
  shortcutList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.5rem',
  } as React.CSSProperties,
  shortcutRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  } as React.CSSProperties,
  kbd: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    padding: '3px 10px',
    fontSize: '0.75rem',
    fontWeight: 600,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
    whiteSpace: 'nowrap' as const,
    textAlign: 'center' as const,
  } as React.CSSProperties,
  desc: {
    fontSize: '0.875rem',
    color: 'var(--text-secondary)',
    textAlign: 'right' as const,
    flex: 1,
  } as React.CSSProperties,
  footer: {
    padding: '0.75rem 1.5rem',
    borderTop: '1px solid var(--border-color)',
    textAlign: 'center' as const,
  } as React.CSSProperties,
  footerText: {
    fontSize: '0.75rem',
    color: 'var(--text-muted)',
  } as React.CSSProperties,
  kbdInline: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1px 6px',
    fontSize: '0.7rem',
    fontWeight: 600,
    fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
    background: 'var(--bg-tertiary)',
    border: '1px solid var(--border-color)',
    borderRadius: 4,
    color: 'var(--text-primary)',
  } as React.CSSProperties,
};

export default function KeyboardShortcutsOverlay() {
  const { state, toggleShortcuts } = useAppContext();

  if (!state.showShortcuts) return null;

  return (
    <div style={s.overlay} onClick={toggleShortcuts}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <h2 style={s.title}>⌨️ Keyboard Shortcuts</h2>
          <button style={s.closeBtn} onClick={toggleShortcuts} aria-label="Close shortcuts">
            ✕
          </button>
        </div>

        {/* Shortcut groups */}
        <div style={s.body}>
          {shortcutGroups.map((group) => (
            <div key={group.title} style={s.group}>
              <h3 style={s.groupTitle}>{group.title}</h3>
              <div style={s.shortcutList}>
                {group.items.map((item) => (
                  <div key={item.keys} style={s.shortcutRow}>
                    <span style={s.kbd}>{item.keys}</span>
                    <span style={s.desc}>{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={s.footer}>
          <span style={s.footerText}>Press <kbd style={s.kbdInline}>?</kbd> or <kbd style={s.kbdInline}>Esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
