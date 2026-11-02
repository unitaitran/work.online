// Dựng phòng thử từ RoomLayout. Toàn bộ đồ đạc gộp thành 1 mesh, tường 1 mesh, sàn 1 mesh.
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  SphereGeometry,
  type Material,
} from 'three';
import { mergePieces, piece, type Piece } from '../engine/meshBuilder';
import type { RoomLayout, RoomProp } from './roomLayout';
import { createFloorTileTexture } from './textures';

const WALL_COLOR = 0xf6e7d8;
const BASEBOARD_COLOR = 0xc9a684;

export interface BuiltRoom {
  readonly group: Group;
  readonly floor: Mesh;
  readonly furniture: Mesh;
}

export function buildRoom(layout: RoomLayout, sharedMaterial: Material): BuiltRoom {
  const group = new Group();
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const width = maxX - minX;
  const depth = maxZ - minZ;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;

  // Sàn: họa tiết canvas lặp, 1 viên gạch = 1 m.
  const floorTexture = createFloorTileTexture();
  floorTexture.repeat.set(width / 2, depth / 2);
  const floor = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshLambertMaterial({ map: floorTexture }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  floor.receiveShadow = true;
  group.add(floor);

  // Tường là mặt phẳng một phía quay vào trong: nhìn từ ngoài vào thì tường "trong suốt",
  // nên camera vòng ra sau tường vẫn thấy nhân vật.
  const h = layout.wallHeight;
  const wallPieces: Piece[] = [];
  const walls: { x: number; z: number; rotY: number; length: number }[] = [
    { x: centerX, z: minZ, rotY: 0, length: width },
    { x: centerX, z: maxZ, rotY: Math.PI, length: width },
    { x: minX, z: centerZ, rotY: Math.PI / 2, length: depth },
    { x: maxX, z: centerZ, rotY: -Math.PI / 2, length: depth },
  ];
  for (const wall of walls) {
    wallPieces.push(
      piece(new PlaneGeometry(wall.length, h), WALL_COLOR, {
        position: [wall.x, h / 2, wall.z],
        rotation: [0, wall.rotY, 0],
      }),
    );
    // Len chân tường: tấm mỏng nhô ra 2 cm.
    const inward = 0.02;
    wallPieces.push(
      piece(new PlaneGeometry(wall.length, 0.14), BASEBOARD_COLOR, {
        position: [
          wall.x + Math.sin(wall.rotY) * inward,
          0.07,
          wall.z + Math.cos(wall.rotY) * inward,
        ],
        rotation: [0, wall.rotY, 0],
      }),
    );
  }
  const wallMesh = new Mesh(mergePieces(wallPieces), sharedMaterial);
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  const furniture = new Mesh(mergePieces(layout.props.flatMap(propPieces)), sharedMaterial);
  furniture.castShadow = true;
  furniture.receiveShadow = true;
  group.add(furniture);

  return { group, floor, furniture };
}

/** Các mảnh hình khối cho một món đồ, nằm gọn trong vùng va chạm của nó. */
function propPieces(prop: RoomProp): Piece[] {
  const { minX, maxX, minZ, maxZ } = prop.box;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const h = prop.height;

  switch (prop.kind) {
    case 'desk': {
      const top = 0.06;
      const pieces = [
        piece(new BoxGeometry(w, top, d), 0xd9a46c, { position: [cx, h - top / 2, cz] }),
        // Hộc bàn hai bên thay cho bốn chân: ít đỉnh hơn mà trông chắc chắn.
        piece(new BoxGeometry(0.45, h - top, d - 0.1), 0xf2efe9, {
          position: [minX + 0.27, (h - top) / 2, cz],
        }),
        piece(new BoxGeometry(0.45, h - top, d - 0.1), 0xf2efe9, {
          position: [maxX - 0.27, (h - top) / 2, cz],
        }),
        // Màn hình máy tính và đế.
        piece(new BoxGeometry(0.7, 0.42, 0.05), 0x3a3f4b, { position: [cx, h + 0.32, cz - 0.15] }),
        piece(new BoxGeometry(0.62, 0.34, 0.01), 0x9fd3e6, {
          position: [cx, h + 0.32, cz - 0.12],
        }),
        piece(new CylinderGeometry(0.03, 0.05, 0.12, 8), 0x3a3f4b, {
          position: [cx, h + 0.06, cz - 0.15],
        }),
        // Cốc cà phê nhỏ cho có không khí.
        piece(new CylinderGeometry(0.05, 0.045, 0.1, 10), 0xffffff, {
          position: [cx + 0.6, h + 0.05, cz + 0.15],
        }),
      ];
      return pieces;
    }
    case 'cabinet': {
      const pieces = [piece(new BoxGeometry(w, h, d), 0x9cb8c9, { position: [cx, h / 2, cz] })];
      // Ngăn kéo: các tấm mỏng ở mặt hướng vào phòng (+X).
      for (let i = 0; i < 4; i += 1) {
        pieces.push(
          piece(new BoxGeometry(0.02, h / 4 - 0.06, d - 0.12), 0xbcd3e0, {
            position: [maxX + 0.005, (i + 0.5) * (h / 4), cz],
          }),
          piece(new BoxGeometry(0.03, 0.03, 0.22), 0x6c7f8b, {
            position: [maxX + 0.02, (i + 0.5) * (h / 4) + 0.08, cz],
          }),
        );
      }
      return pieces;
    }
    case 'plant': {
      const potHeight = 0.42;
      const radius = Math.min(w, d) / 2;
      return [
        piece(new CylinderGeometry(radius * 0.75, radius * 0.55, potHeight, 14), 0xe08a6d, {
          position: [cx, potHeight / 2, cz],
        }),
        piece(new SphereGeometry(radius * 0.95, 14, 10), 0x77b07a, {
          position: [cx, potHeight + radius * 0.75, cz],
          scale: [1, 1.15, 1],
        }),
        piece(new SphereGeometry(radius * 0.6, 12, 8), 0x8cc58c, {
          position: [cx + radius * 0.25, h - radius * 0.45, cz + radius * 0.1],
        }),
      ];
    }
    case 'sofa': {
      const seat = 0.42;
      return [
        piece(new BoxGeometry(w, seat, d), 0xf0a7a0, { position: [cx, seat / 2, cz] }),
        piece(new BoxGeometry(w, h - seat, 0.25), 0xe8968f, {
          position: [cx, seat + (h - seat) / 2, maxZ - 0.125],
        }),
        piece(new BoxGeometry(0.22, 0.6, d), 0xe8968f, { position: [minX + 0.11, 0.3, cz] }),
        piece(new BoxGeometry(0.22, 0.6, d), 0xe8968f, { position: [maxX - 0.11, 0.3, cz] }),
      ];
    }
    case 'printer':
      return [
        piece(new BoxGeometry(w, h * 0.7, d), 0xdedfe3, { position: [cx, (h * 0.7) / 2, cz] }),
        piece(new BoxGeometry(w * 0.9, h * 0.3, d * 0.8), 0xc7c9cf, {
          position: [cx, h * 0.85, cz - d * 0.05],
        }),
        piece(new BoxGeometry(w * 0.6, 0.02, 0.3), 0xffffff, {
          position: [cx, h * 0.72, cz + d * 0.35],
        }),
      ];
  }
}
