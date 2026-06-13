import React from 'react';
import styles from './Sidebar.module.css';
import { useAppContext } from '../../context/AppContext';
import FileUploadDropZone from '../UI/FileUploadDropZone';
import SidebarProgress from '../UI/SidebarProgress';
import PageList from '../UI/PageList';

export default function Sidebar() {
  const { state, toggleSidebar } = useAppContext();

  const isOpen = state.sidebarOpen;

  const sidebarStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: isOpen ? '18rem' : 0,
    minWidth: 0,
    background: 'var(--bg-secondary)',
    borderRight: isOpen ? '1px solid var(--border-color)' : 'none',
    overflow: 'hidden',
    transition:
      'width var(--transition-normal), transform var(--transition-normal), opacity var(--transition-normal)',
    opacity: isOpen ? 1 : 0,
  };

  const sidebarContentStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    minWidth: '18rem',
  };

  const sectionBorderStyle: React.CSSProperties = {
    borderBottom: '1px solid var(--border-color)',
  };

  const dropZoneSectionStyle: React.CSSProperties = {
    padding: '0.75rem',
    ...sectionBorderStyle,
  };

  const progressSectionStyle: React.CSSProperties = {
    padding: '0.75rem',
    ...sectionBorderStyle,
  };

  const pageListSectionStyle: React.CSSProperties = {
    flex: 1,
    overflowY: 'auto',
    padding: '0.5rem',
  };

  return (
    <>
      <aside style={sidebarStyle}>
        <div style={sidebarContentStyle}>
          <div style={dropZoneSectionStyle}>
            <FileUploadDropZone />
          </div>
          <div style={progressSectionStyle}>
            <SidebarProgress />
          </div>
          <div style={pageListSectionStyle}>
            <PageList />
          </div>
        </div>
      </aside>

      {isOpen && (
        <div
          className={styles.mobileOverlay}
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}
    </>
  );
}
