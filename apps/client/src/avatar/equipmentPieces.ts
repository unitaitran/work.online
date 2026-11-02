// Trang phục mua ở cửa hàng, dựng bằng hình học Three.js (không file mô hình).
// Toạ độ: nón và phụ kiện đầu tính trong khung đầu (tâm đầu ở y = 0.25, bán kính ~0.27);
// phụ kiện thân tính trong khung thân (cổ ở y = 0.64, vai ở y = 0.57).
import { BoxGeometry, ConeGeometry, CylinderGeometry, SphereGeometry, TorusGeometry } from 'three';
import { piece, type Piece } from '../engine/meshBuilder';

const HC = 0.25; // tâm đầu
const R = 0.27; // bán kính đầu

export function hatPieces(model: string, color: number): Piece[] {
  const top = HC + R * 0.9;
  switch (model) {
    case 'cap':
      return [
        piece(new SphereGeometry(R * 1.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), color, {
          position: [0, HC + 0.03, 0],
        }),
        piece(new CylinderGeometry(0.16, 0.16, 0.02, 16, 1, false, 0, Math.PI), color, {
          position: [0, HC + 0.06, 0.2],
          scale: [1.1, 1, 1.2],
        }),
      ];
    case 'beanie':
      return [
        piece(new SphereGeometry(R * 1.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), color, {
          position: [0, HC + 0.02, 0],
        }),
        piece(new TorusGeometry(R * 1.12, 0.03, 8, 20), 0xffffff, {
          position: [0, HC + 0.04, 0],
          rotation: [Math.PI / 2, 0, 0],
        }),
        piece(new SphereGeometry(0.05, 10, 8), 0xffffff, { position: [0, top + 0.05, 0] }),
      ];
    case 'bucket':
      return [
        piece(new CylinderGeometry(R * 0.95, R * 1.13, 0.18, 18), color, {
          position: [0, HC + 0.17, 0],
        }),
        piece(new CylinderGeometry(R * 1.45, R * 1.45, 0.02, 20), color, {
          position: [0, HC + 0.1, 0],
        }),
      ];
    case 'party':
      return [
        piece(new ConeGeometry(0.11, 0.3, 14), color, {
          position: [0.05, top + 0.13, 0],
          rotation: [0, 0, -0.2],
        }),
        piece(new SphereGeometry(0.035, 8, 6), 0xffe27a, { position: [0.11, top + 0.28, 0] }),
      ];
    case 'chef':
      return [
        piece(new CylinderGeometry(0.2, 0.2, 0.16, 16), color, { position: [0, top + 0.02, 0] }),
        piece(new SphereGeometry(0.24, 16, 10), color, {
          position: [0, top + 0.16, 0],
          scale: [1, 0.6, 1],
        }),
      ];
    case 'crown': {
      const pieces: Piece[] = [
        piece(new CylinderGeometry(0.17, 0.17, 0.08, 16, 1, true), color, {
          position: [0, top + 0.02, 0],
        }),
      ];
      for (let i = 0; i < 5; i += 1) {
        const a = (i / 5) * Math.PI * 2;
        pieces.push(
          piece(new ConeGeometry(0.035, 0.09, 6), color, {
            position: [Math.sin(a) * 0.16, top + 0.1, Math.cos(a) * 0.16],
          }),
          piece(new SphereGeometry(0.018, 6, 4), 0xe0575b, {
            position: [Math.sin(a) * 0.17, top + 0.03, Math.cos(a) * 0.17],
          }),
        );
      }
      return pieces;
    }
    case 'sprout':
      return [
        piece(new CylinderGeometry(0.012, 0.012, 0.12, 6), 0x5f9e5a, {
          position: [0, top + 0.06, 0],
        }),
        piece(new SphereGeometry(0.05, 8, 6), color, {
          position: [-0.045, top + 0.12, 0],
          scale: [1.3, 0.5, 0.8],
          rotation: [0, 0, 0.5],
        }),
        piece(new SphereGeometry(0.05, 8, 6), color, {
          position: [0.045, top + 0.13, 0],
          scale: [1.3, 0.5, 0.8],
          rotation: [0, 0, -0.5],
        }),
      ];
    default:
      return [];
  }
}

/** Phụ kiện gắn lên đầu (kính, tai nghe). */
export function headAccessoryPieces(model: string, color: number): Piece[] {
  const eyeY = HC + 0.01;
  const z = R * 0.93;
  switch (model) {
    case 'glasses':
    case 'sunglasses': {
      const lens = model === 'sunglasses';
      const pieces: Piece[] = [
        piece(new BoxGeometry(0.06, 0.012, 0.012), color, { position: [0, eyeY + 0.02, z + 0.02] }),
      ];
      for (const side of [-1, 1]) {
        pieces.push(
          piece(new TorusGeometry(0.052, 0.009, 6, 16), color, {
            position: [0.09 * side, eyeY, z + 0.02],
          }),
        );
        if (lens) {
          pieces.push(
            piece(new CylinderGeometry(0.05, 0.05, 0.01, 14), color, {
              position: [0.09 * side, eyeY, z + 0.02],
              rotation: [Math.PI / 2, 0, 0],
            }),
          );
        }
      }
      return pieces;
    }
    case 'headphones':
      return [
        piece(new TorusGeometry(R * 1.04, 0.02, 6, 24, Math.PI), color, {
          position: [0, HC + 0.02, 0],
        }),
        piece(new CylinderGeometry(0.075, 0.075, 0.06, 14), color, {
          position: [-R * 1.03, HC, 0],
          rotation: [0, 0, Math.PI / 2],
        }),
        piece(new CylinderGeometry(0.075, 0.075, 0.06, 14), color, {
          position: [R * 1.03, HC, 0],
          rotation: [0, 0, Math.PI / 2],
        }),
      ];
    default:
      return [];
  }
}

/** Phụ kiện gắn lên thân (khăn, cà vạt, nơ, ba lô, dây đeo thẻ). */
export function bodyAccessoryPieces(model: string, color: number): Piece[] {
  const neck = 0.64;
  switch (model) {
    case 'scarf':
      return [
        piece(new TorusGeometry(0.1, 0.035, 8, 18), color, {
          position: [0, neck - 0.03, 0],
          rotation: [Math.PI / 2, 0, 0],
        }),
        piece(new BoxGeometry(0.06, 0.16, 0.03), color, { position: [0.05, neck - 0.12, 0.12] }),
      ];
    case 'tie':
      return [
        piece(new BoxGeometry(0.04, 0.03, 0.02), color, { position: [0, neck - 0.04, 0.155] }),
        piece(new ConeGeometry(0.035, 0.17, 4), color, {
          position: [0, neck - 0.14, 0.165],
          rotation: [Math.PI, Math.PI / 4, 0],
        }),
      ];
    case 'bowtie':
      return [
        piece(new ConeGeometry(0.035, 0.06, 4), color, {
          position: [-0.035, neck - 0.04, 0.155],
          rotation: [0, 0, Math.PI / 2],
        }),
        piece(new ConeGeometry(0.035, 0.06, 4), color, {
          position: [0.035, neck - 0.04, 0.155],
          rotation: [0, 0, -Math.PI / 2],
        }),
        piece(new SphereGeometry(0.018, 6, 4), color, { position: [0, neck - 0.04, 0.16] }),
      ];
    case 'backpack':
      return [
        piece(new BoxGeometry(0.26, 0.28, 0.12), color, { position: [0, 0.47, -0.2] }),
        piece(new BoxGeometry(0.2, 0.1, 0.04), 0x4a6a50, { position: [0, 0.4, -0.27] }),
      ];
    case 'lanyard':
      return [
        piece(new TorusGeometry(0.11, 0.008, 4, 16, Math.PI), color, {
          position: [0, neck - 0.08, 0.1],
          rotation: [0.4, 0, Math.PI],
        }),
        piece(new BoxGeometry(0.07, 0.09, 0.01), 0xffffff, { position: [0, neck - 0.22, 0.16] }),
      ];
    default:
      return [];
  }
}

export const HEAD_ACCESSORIES: ReadonlySet<string> = new Set([
  'glasses',
  'sunglasses',
  'headphones',
]);
