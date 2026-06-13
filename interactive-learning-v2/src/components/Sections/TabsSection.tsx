import React, { useState, useCallback } from 'react';
import type { TabsSection as TabsSectionType } from '../../types/schema';
import { renderMarkdown } from '../../utils/renderContent';

interface TabsSectionProps {
  section: TabsSectionType;
}

export default function TabsSection({ section }: TabsSectionProps) {
  const [activeTab, setActiveTab] = useState(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newIndex = activeTab;
      if (e.key === 'ArrowRight') {
        newIndex = (activeTab + 1) % section.tabs.length;
      } else if (e.key === 'ArrowLeft') {
        newIndex = (activeTab - 1 + section.tabs.length) % section.tabs.length;
      } else {
        return;
      }
      e.preventDefault();
      setActiveTab(newIndex);
    },
    [activeTab, section.tabs.length]
  );

  return (
    <div style={{
      padding: '1.5rem',
      backgroundColor: 'var(--bg-primary)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      boxShadow: 'var(--shadow-card)',
      marginBottom: '1.5rem',
    }}>
      {section.title && <h2 style={{
        fontSize: '1.25rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: '0.75rem',
      }}>{section.title}</h2>}

      <div style={{
        display: 'flex',
        gap: '2px',
        borderBottom: '2px solid var(--border-color)',
        marginBottom: '1rem',
      }} role="tablist" onKeyDown={handleKeyDown}>
        {section.tabs.map((tab, i) => (
          <button
            key={i}
            role="tab"
            id={`tab-${i}`}
            aria-selected={i === activeTab}
            aria-controls={`tabpanel-${i}`}
            tabIndex={i === activeTab ? 0 : -1}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              borderBottom: i === activeTab ? '2px solid var(--accent)' : '2px solid transparent',
              backgroundColor: i === activeTab ? 'var(--bg-secondary)' : 'transparent',
              color: i === activeTab ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: i === activeTab ? 600 : 400,
              marginBottom: '-2px',
              borderRadius: '4px 4px 0 0',
              transition: 'var(--transition-fast)',
            }}
            onClick={() => setActiveTab(i)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {section.tabs.map((tab, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`tabpanel-${i}`}
          aria-labelledby={`tab-${i}`}
          hidden={i !== activeTab}
          style={{
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(tab.content) }} />
        </div>
      ))}
    </div>
  );
}
