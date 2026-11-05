/**
 * Ammo-type glyphs, taken from DIM's `destiny-icons/general/ammo-*.svg`.
 *
 * The game colours these itself (primary white, special green, heavy violet), so
 * the fills stay as shipped rather than following our theme.
 */
const svg = (markup: string): string => `data:image/svg+xml,${encodeURIComponent(markup)}`

/** `equippingBlock.ammoType` → icon. */
export const AMMO_ICON: Record<number, string> = {
  1: svg("<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1434 1024\"><path fill=\"#ffffff\" d=\"M716.8 243.2c38.4 0 89.6 128 89.6 179.2h-179.2c0-51.2 51.2-179.2 89.6-179.2z\"></path><path fill=\"#ffffff\" d=\"M627.2 473.6h179.2v294.4h-179.2v-294.4z\"></path><path fill=\"#ffffff\" d=\"M179.2 1024l-179.2-179.2v-665.6l179.2-179.2h1075.2l179.2 179.2v665.6l-179.2 179.2zM230.4 896h972.8l102.4-102.4v-563.2l-102.4-102.4h-972.8l-102.4 102.4v563.2z\"></path></svg>"),
  2: svg("<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1434 1024\"><path fill=\"#7af48b\" d=\"M588.8 243.2c38.4 0 89.6 128 89.6 179.2h-179.2c0-51.2 51.2-179.2 89.6-179.2z\"></path><path fill=\"#7af48b\" d=\"M499.2 473.6h179.2v294.4h-179.2v-294.4z\"></path><path fill=\"#7af48b\" d=\"M844.8 243.2c38.4 0 89.6 128 89.6 179.2h-179.2c0-51.2 51.2-179.2 89.6-179.2z\"></path><path fill=\"#7af48b\" d=\"M755.2 473.6h179.2v294.4h-179.2v-294.4z\"></path><path fill=\"#7af48b\" d=\"M179.2 1024l-179.2-179.2v-665.6l179.2-179.2h1075.2l179.2 179.2v665.6l-179.2 179.2zM230.4 896h972.8l102.4-102.4v-563.2l-102.4-102.4h-972.8l-102.4 102.4v563.2z\"></path></svg>"),
  3: svg("<svg version=\"1.1\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1434 1024\"><path fill=\"#b286ff\" d=\"M460.8 243.2c38.4 0 89.6 128 89.6 179.2h-179.2c0-51.2 51.2-179.2 89.6-179.2z\"></path><path fill=\"#b286ff\" d=\"M716.8 243.2c38.4 0 89.6 128 89.6 179.2h-179.2c0-51.2 51.2-179.2 89.6-179.2z\"></path><path fill=\"#b286ff\" d=\"M972.8 243.2c38.4 0 89.6 128 89.6 179.2h-179.2c0-51.2 51.2-179.2 89.6-179.2z\"></path><path fill=\"#b286ff\" d=\"M371.2 473.6h179.2v294.4h-179.2v-294.4z\"></path><path fill=\"#b286ff\" d=\"M627.2 473.6h179.2v294.4h-179.2v-294.4z\"></path><path fill=\"#b286ff\" d=\"M883.2 473.6h179.2v294.4h-179.2v-294.4z\"></path><path fill=\"#b286ff\" d=\"M179.2 1024l-179.2-179.2v-665.6l179.2-179.2h1075.2l179.2 179.2v665.6l-179.2 179.2zM230.4 896h972.8l102.4-102.4v-563.2l-102.4-102.4h-972.8l-102.4 102.4v563.2z\"></path></svg>"),
}

/**
 * Ammo icon key, from the localized label.
 *
 * The detail view carries the display name, not the enum, so this is the bridge
 * back to `equippingBlock.ammoType` (1 primary, 2 special, 3 heavy).
 */
export const AMMO_CODE: Record<string, number> = { 主要弹药: 1, 特殊弹药: 2, 重型弹药: 3 }
