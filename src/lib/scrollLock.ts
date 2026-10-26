// 拡大モードと詳細モーダルが、同じbodyのoverflowを共同で所有します。
// 最後の所有者が解放した時だけ復元するため、破棄順に依存しません。
const owners = new Set<symbol>();
let restore: (() => void) | undefined;

export function lockBodyOverflow(): () => void {
  const style = document.body.style;
  if (owners.size === 0) {
    const value = style.getPropertyValue("overflow");
    const priority = style.getPropertyPriority("overflow");
    restore = () => {
      if (value) style.setProperty("overflow", value, priority);
      else style.removeProperty("overflow");
    };
  }
  const owner = Symbol("scroll-lock");
  owners.add(owner);
  style.overflow = "hidden";
  return () => {
    if (!owners.delete(owner)) return;
    if (owners.size === 0) {
      restore?.();
      restore = undefined;
    }
  };
}
