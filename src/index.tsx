/* @refresh reload */
import { render } from 'solid-js/web';

import './index.css';
import App from './App';
import { TimelineProvider } from './TimelineContext';

const root = document.getElementById('root');

render(
  () => (
    <TimelineProvider>
      <App />
    </TimelineProvider>
  ),
  root!,
);
