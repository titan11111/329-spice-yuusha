declare namespace Phaser {
  class Scene { constructor(k?: string); [k: string]: any }
  class Game { constructor(c: any); [k: string]: any; canvas: any; events: any }
  const AUTO: any; const Scale: any; const Math: any; const Display: any;
  namespace GameObjects { type Image = any; type GameObject = any }
}
declare module 'phaser' { export = Phaser }
declare module '*.css';
