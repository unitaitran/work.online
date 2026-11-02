// Gộp nhiều khối hình học nhỏ thành MỘT geometry, màu của từng khối ghi vào màu đỉnh (vertex color).
// Nhờ vậy mỗi bộ phận chỉ tốn 1 draw call và cả cảnh dùng chung một vật liệu.
import {
  BufferAttribute,
  Color,
  Euler,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Triple = readonly [number, number, number];

export interface Piece {
  geometry: BufferGeometry;
  /** Màu sRGB dạng 0xRRGGBB. */
  color: number;
}

export interface PlaceOptions {
  position?: Triple;
  rotation?: Triple;
  scale?: Triple;
}

const tmpMatrix = new Matrix4();
const tmpQuaternion = new Quaternion();
const tmpEuler = new Euler();
const tmpPosition = new Vector3();
const tmpScale = new Vector3();

/** Tạo một mảnh: đặt geometry vào vị trí/góc/tỉ lệ rồi gắn màu. */
export function piece(geometry: BufferGeometry, color: number, options: PlaceOptions = {}): Piece {
  const [px, py, pz] = options.position ?? [0, 0, 0];
  const [rx, ry, rz] = options.rotation ?? [0, 0, 0];
  const [sx, sy, sz] = options.scale ?? [1, 1, 1];
  tmpMatrix.compose(
    tmpPosition.set(px, py, pz),
    tmpQuaternion.setFromEuler(tmpEuler.set(rx, ry, rz)),
    tmpScale.set(sx, sy, sz),
  );
  geometry.applyMatrix4(tmpMatrix);
  return { geometry, color };
}

/** Gộp các mảnh thành một geometry có thuộc tính màu đỉnh. Geometry nguồn bị giải phóng. */
export function mergePieces(pieces: readonly Piece[]): BufferGeometry {
  const color = new Color();
  const prepared = pieces.map(({ geometry, color: hex }) => {
    // Chỉ giữ position + normal để mọi mảnh có cùng bộ thuộc tính.
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    }
    const nonIndexed = geometry.index ? geometry.toNonIndexed() : geometry;
    color.setHex(hex); // chuyển sRGB -> không gian màu tuyến tính
    const count = nonIndexed.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    nonIndexed.setAttribute('color', new BufferAttribute(colors, 3));
    if (nonIndexed !== geometry) geometry.dispose();
    return nonIndexed;
  });

  // Kiểu khai báo không có null nhưng thực tế trả null khi thuộc tính lệch nhau.
  const merged = mergeGeometries(prepared, false) as BufferGeometry | null;
  for (const geometry of prepared) geometry.dispose();
  if (!merged) throw new Error('mergeGeometries failed');
  merged.computeBoundingSphere();
  return merged;
}

/** Vật liệu dùng chung cho mọi khối có màu đỉnh (Lambert: rẻ, hợp phong cách dễ thương). */
export function createVertexColorMaterial(): MeshLambertMaterial {
  return new MeshLambertMaterial({ vertexColors: true });
}
