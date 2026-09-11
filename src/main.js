import { Game } from './game.js';

const root = document.getElementById('app');
const game = new Game(root);

// Handy for debugging in the browser console (not used by the game itself).
window.mota = game;
