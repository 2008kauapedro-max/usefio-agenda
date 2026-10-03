import {createRoot} from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import App from '../../src/App';
import {I18nProvider} from '../../src/i18n';
import '../../src/styles.css';

localStorage.setItem('fio:locale','pt-BR');
localStorage.setItem('fio:region','BR');
localStorage.setItem('fio:currency','BRL');
document.documentElement.lang='pt-BR';

createRoot(document.getElementById('root')!).render(
 <I18nProvider>
  <BrowserRouter>
   <App/>
  </BrowserRouter>
 </I18nProvider>
);