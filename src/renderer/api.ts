import type { FriedLiverApi } from '../shared/ipc';

declare global {
  interface Window {
    friedliver: FriedLiverApi;
  }
}

export const api = window.friedliver;
