import React from 'react';
import { useAppContext } from '../../context/AppContext';
import PageListItem from './PageListItem';

export default function PageList() {
  const { state, visibleIndices, currentPage } = useAppContext();

  return (
    <div>
      {visibleIndices.map((pageIndex) => (
        <PageListItem
          key={pageIndex}
          page={state.pages[pageIndex]}
          index={pageIndex}
          isActive={state.currentPageIndex === pageIndex}
          isCompleted={!!state.pages[pageIndex]?._meta?.completed}
          isViewed={state.viewedPages.includes(pageIndex)}
          isQuizDone={false} /* Could compute from quizScores if needed */
        />
      ))}
    </div>
  );
}
