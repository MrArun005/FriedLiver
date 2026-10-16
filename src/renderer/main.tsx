import { render } from 'preact';
import { App } from './app';
import { applyAppearance } from './appearance';
import './styles.css';

document.documentElement.classList.add(`platform-${window.friedliver.platform}`);
applyAppearance();
render(<App />, document.getElementById('root')!);
