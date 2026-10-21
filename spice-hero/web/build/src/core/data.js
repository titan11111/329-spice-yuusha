// data/*.json を型付きで読み込む。値の変更は data/ 側だけで行う（docs/03_BALANCE.md の調整ログに記録）。
import uiThemeJson from '../../data/ui_theme.json' with { type: 'json' };
import inputJson from '../../data/input.json' with { type: 'json' };
import expJson from '../../data/exp_table.json' with { type: 'json' };
import partyJson from '../../data/party.json' with { type: 'json' };
import spellsJson from '../../data/spells.json' with { type: 'json' };
import itemsJson from '../../data/items.json' with { type: 'json' };
import equipmentJson from '../../data/equipment.json' with { type: 'json' };
import shopsJson from '../../data/shops.json' with { type: 'json' };
import enemiesJson from '../../data/enemies.json' with { type: 'json' };
import encountersJson from '../../data/encounters.json' with { type: 'json' };
import mapsJson from '../../data/maps.json' with { type: 'json' };
import chestsJson from '../../data/chests.json' with { type: 'json' };
export const uiTheme = uiThemeJson;
export const inputConfig = inputJson;
export const expTable = expJson;
export const partyData = partyJson;
export const spells = spellsJson.list;
export const items = itemsJson;
export const equipment = equipmentJson.list;
export const shopsData = shopsJson;
const enemiesAll = enemiesJson;
export const enemyList = [...enemiesAll.list, ...enemiesAll.bosses];
export const encounters = encountersJson;
export const mapsData = mapsJson;
export const chestsData = chestsJson;
const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
export const spellById = byId(spells);
export const itemById = byId(items.list);
export const equipById = byId(equipment);
export const enemyById = byId(enemyList);
export const memberById = byId(partyData.members);
export function must(v, what) {
    if (v === undefined)
        throw new Error(`データがありません: ${what}`);
    return v;
}
