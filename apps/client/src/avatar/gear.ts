// Đổi danh sách món đang trang bị thành thông số dựng hình cho nhân vật.
import { equipmentFromIds, shopItem } from '@dilam/shared';
import type { AvatarGear } from './avatarModel';

export function gearFromEquipped(ids: readonly string[] | undefined): AvatarGear {
  const e = equipmentFromIds(ids ?? []);
  const gear: AvatarGear = {};
  const top = e.top ? shopItem(e.top) : null;
  if (top) gear.topTint = top.color;
  const hat = e.hat ? shopItem(e.hat) : null;
  if (hat) gear.hat = { model: hat.model, color: hat.color };
  const acc = e.accessory ? shopItem(e.accessory) : null;
  if (acc) gear.accessory = { model: acc.model, color: acc.color };
  return gear;
}
