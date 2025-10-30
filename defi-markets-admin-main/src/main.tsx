import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App.tsx'
import './index.css'
import './components/wallet/wallet.tsx'
// Polyfill Buffer for browser compatibility
import { Buffer } from 'buffer'
window.Buffer = Buffer

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <App />
  </Provider>
);
