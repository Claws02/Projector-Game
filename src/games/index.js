// Game registry, in home-screen order.

import orbpop from './orbpop.js';
import keepup from './keepup.js';
import storm from './storm.js';
import volley from './volley.js';
import smash from './smash.js';
import paint from './paint.js';
import simon from './simon.js';

export const GAMES = [orbpop, keepup, storm, volley, smash, paint, simon];

export const gameById = (id) => GAMES.find((g) => g.id === id) ?? null;

// Games playable with the current tracking setup.
export const availableGames = (handModel) => GAMES.filter((g) => handModel || !g.needsHandModel);
