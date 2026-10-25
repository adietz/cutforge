import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Paper.js owns the canvas; avoid React StrictMode double-mount in dev.
createRoot(document.getElementById('root')!).render(<App />)
