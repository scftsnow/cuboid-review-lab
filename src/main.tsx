import { createRoot } from 'react-dom/client';
import App from './app/App';
import './app/app.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error('ROOT_ELEMENT_MISSING');
} else {
  createRoot(rootElement).render(<App />);
}
