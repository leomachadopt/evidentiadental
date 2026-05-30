import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/index.css';

// Captura o ?ref= do link ANTES de qualquer routing — o ProtectedRoute
// redireciona para /login com `replace` e perderia a query. Fica em
// localStorage até o registo o consumir.
const refCode = new URLSearchParams(window.location.search).get('ref');
if (refCode) localStorage.setItem('referralCode', refCode.toUpperCase().trim());

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
