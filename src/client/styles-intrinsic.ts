/** The exotic's own effect: icon, name, then the flavour text in full. */
export const INTRINSIC_CSS = `
.inventory-hover-intrinsic {
  display: flex;
  gap: 10px;
  padding: 9px 13px;
  border-block: 1px solid rgba(233, 208, 113, .28);
  background: rgba(120, 96, 24, .22);
}
.inventory-hover-intrinsic__icon {
  inline-size: 34px;
  block-size: 34px;
  flex: 0 0 auto;
  border-radius: 4px;
  object-fit: contain;
}
.inventory-hover-intrinsic h3 {
  margin: 0 0 3px;
  font-size: 12px;
  font-weight: 600;
  color: #f0e3b6;
}
.inventory-hover-intrinsic p {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: #d7cfbe;
  white-space: pre-line;
}
`
