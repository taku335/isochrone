import { getAppName } from './index.js';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (app === null) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <main class="shell">
    <p class="eyebrow">Nagoya City Bus</p>
    <h1>${getAppName()}</h1>
    <p>Docker Compose development environment is ready.</p>
  </main>
`;
