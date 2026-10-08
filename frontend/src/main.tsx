import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { theme } from './theme';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider
      forceColorScheme="light"
      theme={theme}
    >
      <Notifications position="top-right" limit={3} />
      <App />
    </MantineProvider>
  </StrictMode>,
);
