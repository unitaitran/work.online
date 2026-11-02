// Đèn lồng đỏ treo dọc tường kính ngày Tết, dựng bằng code (một mesh gộp).
import { CylinderGeometry, Group, Mesh, SphereGeometry, type Material } from 'three';
import type { OfficeLayout } from '@dilam/shared';
import { mergePieces, piece, type Piece } from '../engine/meshBuilder';

export function buildLanterns(layout: OfficeLayout, material: Material): Group {
  const pieces: Piece[] = [];
  const y = layout.wallHeight - 0.55;
  const z = layout.bounds.minZ + 0.45;
  const xs = layout.windows.spans.flatMap((span) => [span.minX + 0.5, span.maxX - 0.5]);
  for (const x of xs) {
    pieces.push(
      piece(new CylinderGeometry(0.006, 0.006, 0.5, 4), 0x8a1c1c, { position: [x, y + 0.42, z] }),
      piece(new CylinderGeometry(0.07, 0.07, 0.04, 10), 0xd8b25a, { position: [x, y + 0.2, z] }),
      piece(new SphereGeometry(0.2, 14, 10), 0xd62828, {
        position: [x, y, z],
        scale: [1, 0.85, 1],
      }),
      piece(new CylinderGeometry(0.07, 0.07, 0.04, 10), 0xd8b25a, { position: [x, y - 0.19, z] }),
      piece(new CylinderGeometry(0.012, 0.02, 0.22, 6), 0xf2c14e, { position: [x, y - 0.32, z] }),
    );
  }
  const group = new Group();
  group.add(new Mesh(mergePieces(pieces), material));
  return group;
}
