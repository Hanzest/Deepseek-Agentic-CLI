import React from 'react';
import { useAppContext } from '../../context/AppContext';
import PageContent from '../Pages/PageContent';
import WelcomePage from '../Pages/WelcomePage';

export default function ContentArea() {
  const { state } = useAppContext();

  if (state.pages.length === 0) {
    return <WelcomePage />;
  }

  return <PageContent />;
}
