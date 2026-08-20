import { invoke } from "@tauri-apps/api/core";
import { Menu, Submenu } from "@tauri-apps/api/menu";

const TEXT = "Toggle Developer Console";

const toggle = () => invoke("toggle_devtools");

const item = {
  text: TEXT,
  accelerator: "CmdOrCtrl+Alt+I",
  action: toggle,
};

/**
 * Adds the console to the app menu under Help. The default menu already has a
 * Help submenu on macOS, so the item joins it rather than opening a second one
 * beside it.
 */
export const installMenu = async () => {
  const menu = await Menu.default();
  const items = await menu.items();

  for (const entry of items) {
    if (entry.kind !== "Submenu") continue;
    if ((await (entry as Submenu).text()) !== "Help") continue;

    await (entry as Submenu).append(item);
    await menu.setAsAppMenu();
    return;
  }

  await menu.append(await Submenu.new({ text: "Help", items: [item] }));
  await menu.setAsAppMenu();
};

/**
 * The app suppresses the webview's own context menu to stop feeling like a web
 * page, which also took away the only other way in. This puts one item back —
 * and only where nothing else claimed the click.
 */
export const contextMenu = async (event: MouseEvent) => {
  if (event.defaultPrevented) return;

  event.preventDefault();
  await (await Menu.new({ items: [item] })).popup();
};
