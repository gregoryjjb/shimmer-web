import './App.css';
import Editor from './Editor';
import { TimelineProvider } from './TimelineContext';

function App() {
  return (
    <TimelineProvider>
      <Editor />
    </TimelineProvider>
  );
}

export default App;
